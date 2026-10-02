import assert from 'node:assert/strict';
import test from 'node:test';
import { ref, toRaw } from 'vue';
import { useTableSelection } from '../src/components/table/complex/useTableSelection.ts';

function fixture(reserve = true) {
    let data = [{ id: 'a' }, { id: 'b' }];
    let checked = [];
    let result = [];
    const table = {
        getSelectionRows: () => checked,
        toggleRowSelection: (row, selected) => {
            assert.ok(data.includes(row), 'Element Plus must receive the actual visible row');
            checked = selected ? [...checked, row] : checked.filter((item) => item !== row);
            selection.handleSelectionChange(checked);
        },
    };
    const selection = useTableSelection(
        ref({ refElTable: table }),
        () => data,
        (rows) => {
            result = rows;
        },
        (row) => !row.disabled,
        reserve ? { getRowKey: (row) => row.id, reserveSelection: () => true } : {},
    );
    return {
        selection,
        get data() {
            return data;
        },
        get checked() {
            return checked;
        },
        get result() {
            return result;
        },
        page(rows) {
            data = rows;
            checked = [];
            selection.pruneSelection();
        },
    };
}

test('image group merges off-page rows and preserves prior selection without duplicates', () => {
    const f = fixture();
    f.selection.selectRow(f.data[1], true);
    f.selection.selectRows([{ id: 'a' }, { id: 'c' }, { id: 'd', disabled: true }]);
    assert.deepEqual(
        f.result.map((row) => row.id),
        ['b', 'a', 'c'],
    );
    assert.deepEqual(f.checked.map((row) => row.id).sort(), ['a', 'b']);
    f.selection.selectRows([{ id: 'a' }, { id: 'c' }]);
    assert.equal(f.result.length, 3);
    f.page([{ id: 'c', state: 'running' }, { id: 'e' }]);
    assert.deepEqual(
        f.checked.map((row) => row.id),
        ['c'],
    );
    assert.equal(f.result.find((row) => row.id === 'c').state, 'running');
    f.selection.handleSelectionChange([]);
    assert.deepEqual(
        f.result.map((row) => row.id),
        ['b', 'a'],
    );
    f.selection.clearSelects();
    assert.deepEqual(f.result, []);
    f.page([{ id: 'a' }]);
    assert.deepEqual(f.checked, []);
});

test('card selection and view switches use the same keyed selections', () => {
    const f = fixture();
    f.selection.selectRows([{ id: 'a' }, { id: 'c' }]);
    assert.equal(f.selection.isRowSelected({ id: 'a' }), true);
    f.selection.selectRow({ id: 'a' }, false);
    assert.deepEqual(
        f.result.map((row) => row.id),
        ['c'],
    );
    f.page([{ id: 'c' }]);
    f.selection.syncTableSelection();
    assert.deepEqual(
        f.checked.map((row) => row.id),
        ['c'],
    );
});

test('other tables retain existing page-local identity semantics', () => {
    const f = fixture(false);
    f.selection.selectRow(f.data[0], true);
    assert.equal(f.selection.isRowSelected(toRaw(f.data[0])), true);
    assert.equal(f.selection.isRowSelected({ id: 'a' }), false);
    f.page([{ id: 'a' }]);
    assert.deepEqual(f.result, []);
    assert.deepEqual(f.checked, []);
});
