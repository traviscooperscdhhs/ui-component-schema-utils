'use-strict';
import SchemaUtils from '../src/ui-component-schema-utils';
import workflowFixture from './fixtures/workflow-with-children.json';
import _ from 'lodash';

describe('SchemaUtils', function(){

  describe('#getMetaData', function() {

    it('returns proper meta data for first top level component',function() {
      let meta = SchemaUtils.getMetaData(workflowFixture, 'page1');
      expect(meta.id).toEqual('page1');
      expect(meta.next).toEqual('page2');
      expect(meta.parent).not.toBeDefined();
      expect(meta.previous).not.toBeDefined();
    });

    it('returns proper meta data for parent',function() {
      let meta = SchemaUtils.getMetaData(workflowFixture, 'page2');
      expect(meta.id).toEqual('page2');
      expect(meta.next).toEqual('page5');
      expect(meta.parent).not.toBeDefined();
      expect(meta.previous).toEqual('page1');
    });

    it('returns proper meta data for first nested component',function() {
      let meta = SchemaUtils.getMetaData(workflowFixture, 'page3');
      expect(meta.id).toEqual('page3');
      expect(meta.next).toEqual('page4');
      expect(meta.parent).toEqual('page2');
      expect(meta.previous).not.toBeDefined();
    });

    it('returns proper meta data for middle nested component',function() {
      let meta = SchemaUtils.getMetaData(workflowFixture, 'page4');
      expect(meta.id).toEqual('page4');
      expect(meta.next).toEqual('page6');
      expect(meta.parent).not.toBeDefined();
      expect(meta.previous).toEqual('page3');
    });

    it('returns proper meta data for last nested component',function() {
      let meta = SchemaUtils.getMetaData(workflowFixture, 'page7');
      expect(meta.id).toEqual('page7');
      expect(meta.next).not.toBeDefined();
      expect(meta.parent).not.toBeDefined();
      expect(meta.previous).toEqual('page6');
    });

    it('returns proper meta data for last top level component',function() {
      let meta = SchemaUtils.getMetaData(workflowFixture, 'page5');
      expect(meta.id).toEqual('page5');
      expect(meta.next).not.toBeDefined();
      expect(meta.parent).not.toBeDefined();
      expect(meta.previous).toEqual('page2');
    });
  });

  describe('#getRootId', function(){
    it('will find the root from any given child', function(){
      let findParent = SchemaUtils.getRootId.bind(null, workflowFixture);
      expect(findParent('page6')).toEqual('page2');
      expect(findParent('page4')).toEqual('page2');
    });
  });

  describe('#moveUp', function(){
    let moveUp = SchemaUtils.moveUp.bind(null, workflowFixture);
    it('can move a component in a binary tree up one level', function(){
      let result1 = moveUp('page5');
      expect(result1.components.page1.next).toBe('page5');
      expect(result1.components.page5.next).toBe('page2');
      expect(result1.components.page2.next).toBeNull();
    });
    it('will not move the first node', function(){
      let result = moveUp('page1');
      expect(_.isEmpty(result.components)).toBe(true);
    });
    it('will move the second node into the first position, and reposition the first node', function(){
      let result = moveUp('page2');
      expect(result.child).toBe('page2');
      expect(result.components.page2.next).toBe('page1');
      expect(result.components.page1.next).toBe('page5');
    });
    it('will move a child node into parent\'s direct child slot', function(){
      let result = moveUp('page4');
      expect(result.components.page2.child).toBe('page4');
      expect(result.components.page4.next).toBe('page3');
      expect(result.components.page3.next).toBe('page6');
    });
  });

  describe('#moveDown', function(){
    let moveDown = SchemaUtils.moveDown.bind(null, workflowFixture);
    it('can move an item down one place in the list', function(){
      let result = moveDown('page2');
      expect(result.components.page1.next).toEqual('page5');
      expect(result.components.page5.next).toEqual('page2');
      expect(result.components.page2.next).toBeNull();
    });
    it('will reposition a direct child node and its next sibling', function(){
      let result = moveDown('page3');
      expect(result.components.page2.child).toBe('page4');
      expect(result.components.page4.next).toBe('page3');
      expect(result.components.page3.next).toBe('page6');
    });
    it('will reposition the root child node and its next sibling', function(){
      let result = moveDown('page1');
      expect(result.child).toBe('page2');
      expect(result.components.page2.next).toBe('page1');
      expect(result.components.page1.next).toBe('page5');
    });
    it('will not move the last item', function(){
      let result = moveDown('page5');
      expect(_.isEmpty(result.components)).toBe(true);
    });
  });

  describe('#nest', function(){
    let nest = SchemaUtils.nest.bind(null, workflowFixture);
    it('can nest a component under existing parent previous sibling', function(){
      let result = nest('page4');
      expect(result.components.page3.child).toEqual('page4');
      expect(result.components.page3.next).toEqual('page6');
      expect(result.components.page4.next).toBeNull();
    });
    it('will not nest the root child component', function(){
      let result = nest('page1');
      expect(result.components.page1).not.toBeDefined();
    });
    it('can nest a component under an existing parent', function(){
      let result = nest('page5');
      expect(result.components.page2.next).toBeNull();
      expect(result.components.page7.next).toBe('page5');
      expect(result.components.page5.next).toBeNull();
    });
  });

  describe('#unNest', function(){
    let unnest = SchemaUtils.unNest.bind(null, workflowFixture);
    it('can unnest a direct child', function(){
      let result = unnest('page3');
      expect(result.components.page2.child).toEqual('page4');
      expect(result.components.page2.next).toEqual('page3');
      expect(result.components.page3.next).toEqual('page5');
    });
    it('can unnest a child', function(){
      let result = unnest('page4');
      expect(result.components.page2.next).toEqual('page4');
      expect(result.components.page3.next).toEqual('page6');
      expect(result.components.page4.next).toEqual('page5');
    });
  });

  describe('#getLastSiblingId', function(){
    it('can find the last sibling in a list', function(){
      let result = SchemaUtils.getLastSiblingId(workflowFixture, 'page3');
      expect(result).toBe('page7');
      let result2 = SchemaUtils.getLastSiblingId(workflowFixture, 'page2');
      expect(result2).toBe('page5');
    });
  });

  describe('#traverse', function(){
    let fn = jasmine.createSpy('fn');
    it('can traverse all siblings in a binary tree', function(){
      SchemaUtils.traverse(workflowFixture, 'page3', fn);
      expect(fn.calls.count()).toEqual(4);
      expect(fn.calls.argsFor(0)[0]).toEqual('page3');
      expect(fn.calls.argsFor(1)[0]).toEqual('page4');
      expect(fn.calls.argsFor(2)[0]).toEqual('page6');
      expect(fn.calls.argsFor(3)[0]).toEqual('page7');
    });
    it('can traverse all siblings and children in a binary tree', function(){
      fn.calls.reset();
      SchemaUtils.traverse(workflowFixture, 'page2', fn);
      expect(fn.calls.count()).toEqual(6);
      expect(fn.calls.argsFor(0)[0]).toEqual('page2');
      expect(fn.calls.argsFor(1)[0]).toEqual('page3');
      expect(fn.calls.argsFor(2)[0]).toEqual('page4');
      expect(fn.calls.argsFor(3)[0]).toEqual('page6');
      expect(fn.calls.argsFor(4)[0]).toEqual('page7');
      expect(fn.calls.argsFor(5)[0]).toEqual('page5');
    });
  });

  describe('#removeComponent', function(){
    let remove = SchemaUtils.removeComponent.bind(null, workflowFixture);
    it('can remove a component and update previous sibling', function(){
      let result = remove('page5');
      expect(result.components.page5).toBeNull();
      expect(result.components.page2.next).toBeNull();
    });
    it('can remove a component and update parent', function(){
      let result = remove('page3');
      expect(result.components.page2.child).toEqual('page4');
      expect(result.components.page3).toBeNull();
    });
    it('can remove the root child and update its next sibling', function(){
      let result = remove('page1');
      expect(result.child).toEqual('page2');
      expect(result.components.page1).toBeNull();
    });
    it('can remove a parent component and its children', function(){
      let result = remove('page2');
      expect(result.components.page1.next).toEqual('page5');
      expect(result.components.page2).toBeNull();
      expect(result.components.page3).toBeNull();
      expect(result.components.page4).toBeNull();
      expect(result.components.page6).toBeNull();
      expect(result.components.page7).toBeNull();
    });
  });

  describe('#addNewChildComponent', function(){
    let add = SchemaUtils.addNewChildComponent.bind(null, workflowFixture);
    let newComponent = {type: 'field', config: {name: 'test'}};
    it('can add a new component to an existing parent', function(){
      // if already a parent
      let result = add('page2', newComponent);
      expect(result.components.page7.next).toEqual('testField');
      expect(result.components.testField).toBeDefined();
      expect(result.components.testField.config.id).toEqual('testField');
      expect(result.components.testField.config.name).toEqual(newComponent.config.name);
      // if is a root schema with child
      let result2 = add(null, newComponent);
      expect(result2.components.testField).toBeDefined();
      expect(result2.components.page5.next).toEqual('testField');
    });
    it('can add a new component to a root schema', function(){
      let result = SchemaUtils.addNewChildComponent({type:'page', components: {}}, null, newComponent);
      expect(result.child).toEqual('testField');
      expect(result.components.testField).toBeDefined();
    });
    it('can add a new component to another component', function(){
      let result = add('page5', newComponent);
      expect(result.components.page5.child).toEqual('testField');
      expect(result.components.testField).toBeDefined();
    });
  });
});
