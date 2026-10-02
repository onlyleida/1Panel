import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the page's real handler with API/table boundaries stubbed.
const source = readFileSync(new URL('../src/views/container/container/index.vue', import.meta.url), 'utf8');
const start = source.indexOf('const selectContainersByImage = async');
const end = source.indexOf('const search = async', start);
assert.ok(start >= 0 && end > start);
const handler = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ESNext });
function fixture(
    items,
    total = items.length,
    search = async () => {
        throw Error('unexpected API call');
    },
) {
    let selected;
    const context = vm.createContext({
        data: { value: items },
        paginationConfig: { total, state: 'running', orderBy: 'name', order: 'ascending' },
        searchName: { value: 'panda' },
        includeAppStore: { value: false },
        router: { currentRoute: { value: { query: { filters: 'project=demo' } } } },
        selectingImage: { value: false },
        selectionContext: 0,
        searchContainer: search,
        containerTableRef: {
            value: {
                selectRows(rows) {
                    selected = Array.from(rows);
                },
            },
        },
    });
    vm.runInContext(handler + '\nglobalThis.click = selectContainersByImage;', context);
    return {
        context,
        get selected() {
            return selected;
        },
        click: context.click,
    };
}

test('same image ID selects aliases but excludes a reused tag with a different ID', async () => {
    const row = { containerID: 'a', imageID: '111', imageName: 'panda:latest' };
    const f = fixture([
        row,
        { containerID: 'b', imageID: '111', imageName: 'panda:old' },
        { containerID: 'c', imageID: '222', imageName: 'panda:latest' },
    ]);
    await f.click(row);
    assert.deepEqual(
        f.selected.map((item) => item.containerID),
        ['a', 'b'],
    );
    assert.equal(f.context.selectingImage.value, false);
});

test('fetches all pages with current filters and selects matches past page 500', async () => {
    const row = { containerID: 'a', imageID: '111', imageName: 'panda:latest' };
    const calls = [];
    const f = fixture([row], 1001, async (params) => {
        calls.push({ ...params });
        return {
            data: {
                total: 1001,
                items: Array.from({ length: params.page === 3 ? 1 : 500 }, (_, i) => ({
                    containerID: `${params.page}-${i}`,
                    imageID: i === 0 ? '111' : '222',
                    imageName: 'panda:latest',
                })),
            },
        };
    });
    await f.click(row);
    assert.deepEqual(
        calls.map((item) => item.page),
        [1, 2, 3],
    );
    assert.ok(
        calls.every(
            (item) =>
                item.pageSize === 500 &&
                item.state === 'running' &&
                item.name === 'panda' &&
                item.filters === 'project=demo' &&
                item.excludeAppStore === true,
        ),
    );
    assert.deepEqual(
        f.selected.map((item) => item.containerID),
        ['1-0', '2-0', '3-0'],
    );
});

test('changing the filter/node during a request discards its selection', async () => {
    const row = { imageID: '111' };
    let finish;
    const f = fixture(
        [row],
        2,
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const request = f.click(row);
    f.context.selectionContext++;
    finish({ data: { total: 2, items: [row, row] } });
    await request;
    assert.equal(f.selected, undefined);
    assert.equal(f.context.selectingImage.value, false);
});

test('a failed page request does not apply a partial group', async () => {
    const row = { imageID: '111' };
    const f = fixture([row], 1000, async (params) => {
        if (params.page === 2) throw Error('API unavailable');
        return { data: { total: 1000, items: Array.from({ length: 500 }, () => row) } };
    });
    await assert.rejects(f.click(row), /API unavailable/);
    assert.equal(f.selected, undefined);
    assert.equal(f.context.selectingImage.value, false);
});
