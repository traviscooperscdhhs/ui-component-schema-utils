'use-strict';
import _ from 'lodash';
import Immutable from 'immutable';

/**
 * Sometimes we want to set a schema value to something that might
 * not exist, but we dont want the result to be "undefined" as that would
 * effectively "delete" the value.
 */
function maybe(value){
  return value || null;
}

/**
 * A collection of static methods for operating on component schema data.
 * @class SchemaUtils
 */
class SchemaUtils {

  /**
   * Return details for passed in componentId
   * @static
   * @param {object} schema
   * @param {object} componentId
   * @return {{id: *, previous: *, parent: *, next: *}}
   */
  static getMetaData(schema, componentId){
    let exists = _.has(schema.components, componentId);
    return {
      id: componentId,
      previous: _.findKey(schema.components, { next: componentId }),
      parent: _.findKey(schema.components, { child: componentId }),
      next: exists? schema.components[componentId].next : null,
      child: exists? schema.components[componentId].child : null
    };
  }

  /**
   * Follow tree up from item, to find first parent encountered in a deeply
   * nested tree structure
   * @static
   * @param {object} schema
   * @param {string} componentId
   * @returns {object} updated schema
   */
  static getRootId(schema, componentId){
    let meta = SchemaUtils.getMetaData(schema, componentId);
    while(meta && !meta.parent){
      meta = SchemaUtils.getMetaData(schema, meta.previous);
    }
    return meta.parent;
  }

  /**
   * Move a component up one level in a binary tree
   * @static
   * @param {object} schema
   * @param {string} componentId
   * @returns {object}
   */
  static moveUp(schema, componentId){
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = { components: {} };
    if ( meta.previous ) {
      let previousPreviousNext = _.findKey(schema.components, { next: meta.previous });
      let previousPreviousChild = _.findKey(schema.components, { child: meta.previous });
      // 1. Parent previous 'next' needs to point to ME
      if ( previousPreviousNext ) {
        updates.components[previousPreviousNext] = {
          next: meta.id
        };
      } else if ( previousPreviousChild ) {
        updates.components[previousPreviousChild] = {
          child: meta.id
        };
      } else {
        // If no previous previous, then I will become first page,
        // so set workflow child to me.
        updates.child = meta.id;
      }
      // 2. My next points to previous
      updates.components[meta.id] = {
        next: meta.previous
      };
      // 3. Previous next points to my next
      updates.components[meta.previous] = {
        next: maybe(meta.next)
      };
    }
    return updates;
  }

  /**
   * Move item down one level in schema
   * @static
   * @param {object} schema
   * @param {string} componentId
   * @returns {object}
   */
  static moveDown(schema, componentId){
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = { components: {} };
    if ( meta.next ) {
      let nextNext = schema.components[meta.next].next;
      // 1. my previous 'next' points to my next
      if ( meta.previous ) {
        updates.components[meta.previous] = {
          next: meta.next
        };
      } else if ( meta.parent ) {
        updates.components[meta.parent] = {
          child: meta.next
        };
      } else {
        // If I'm the first page, update the workflow child to point to my next.
        updates.child =  meta.next;
      }
      // 2. myNext 'next' points to me
      updates.components[meta.next] = {
        next: meta.id
      };
      // 3. ME 'next' points to myNext 'next'
      updates.components[meta.id] = {
        next: maybe(nextNext)
      };
    }
    return updates;
  }

  /**
   * Nest item under previous node
   * @static
   * @param schema
   * @param componentId
   * @returns {object} Updated Schema
   */
  static nest(schema, componentId){
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = { components: {} };
    if ( meta.previous ) {
      let previousChild = schema.components[meta.previous].child;
      if ( previousChild ) {
        let parentLastChild = SchemaUtils.getLastSiblingId(schema, previousChild);
        updates.components[meta.previous] = {
          next: maybe(meta.next)
        };
        updates.components[parentLastChild] = {
          next: meta.id
        };
      } else {
        updates.components[meta.previous] = {
          next: maybe(meta.next),
          child: meta.id
        };
      }
      updates.components[meta.id] = {
        next: null
      };
    }
    return updates;
  }

  /**
   * Remove item from parent tree, and move to parent.next in the tree
   * @static
   * @param {object} schema
   * @param {string} componentId
   * @returns {object} Updated Schema
   */
  static unNest(schema, componentId){
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = { components: {} };
    let parent = meta.parent;
    let previous = meta.previous;

    if ( parent ) {
      updates.components[parent] = {
        child: meta.next ,
        next:  meta.id
      };
    } else {
      parent = SchemaUtils.getRootId(schema, previous);
      updates.components[parent] = {
        next:  meta.id
      };
      updates.components[previous] = {
        next: meta.next
      };
    }

    updates.components[meta.id] = {
      next: maybe(schema.components[parent].next)
    };

    return updates;
  }

  /**
   * Find the "id" property of the last sibling in a sub list
   * @static
   * @param {object} schema
   * @param {string} componentId
   * @returns {object}
   */
  static getLastSiblingId(schema, componentId){
    let head = schema.components[componentId];
    let id = componentId;
    while(head.next){
      id = head.next;
      head = schema.components[id];
    }
    return id;
  }

  /**
   * WARNING: This method will produce side effects in your code. Use with
   * much caution and discernment.
   *
   * Traverse the binary tree from the passed in componentId and call
   * a function for each node. Uses depth-first traversal.
   * @static
   * @param {object} schema
   * @param {string} componentId
   * @param {function} fn
   */
  static traverse(schema, componentId, fn){
    let head = schema.components[componentId];
    let id = componentId;
    while(head){
      fn(id, head);
      if ( head.child ) {
        SchemaUtils.traverse(schema, head.child, fn);
      }
      id = head.next;
      head = schema.components[id];
    }
  }

  /**
   * Nullify a given component and its children to affectively "remove"
   * it from the schema.
   * @static
   * @param {object} schema
   * @param {string} componentId
   * @returns {object}
   */
  static removeComponent(schema, componentId){
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = { components: {} };
    // nullify the passed in componentId
    updates.components[componentId] = null;
    // take the component that points to me and make it
    // point to my next sibling instead
    if ( meta.previous ) {
      updates.components[meta.previous] = {
        next: maybe(meta.next)
      };
    } else if ( meta.parent ) {
      // if I am a direct child, point my parent to my next sibling
      updates.components[meta.parent] = {
        child: maybe(meta.next)
      };
    } else if ( schema.child === componentId ) {
      // if I am the direct child of the parent schema, point to
      // my next sibling
      updates.child = maybe(meta.next);
    }
    // remove any child components
    if ( meta.child ) {
      SchemaUtils.traverse(schema, meta.child, function(id, components){
        updates.components[id] = null;
      });
    }

    return updates;
  }

  /**
   * Adds a new child component to specified parent.
   * @static
   * @param {object} schema - root schema
   * @param {string} parentId - parent to add child to
   * @param {object} childSchema - new component to add
   * @returns {object}
   */
  static addNewChildComponent(schema, parentId, childSchema){
    let newComponentId = _.camelCase([childSchema.config.name, childSchema.type].join(' '));
    let parent = parentId? schema.components[parentId] : schema;
    let updates = {
      components: {
        [newComponentId]: Immutable.fromJS(childSchema).setIn(['config', 'id'], newComponentId).toJSON()
      }
    };
    // if the parent already has children, set the new component as the last child
    // NOTE: parent could be a root schema with children
    if ( parent.child ) {
      let lastSibling = SchemaUtils.getLastSiblingId(schema, parent.child);
      updates.components[lastSibling] = {
        next: newComponentId
      };
    } else if ( parentId ){
      // parent is a new parent without existing children
      updates.components[parentId] = { child:  newComponentId };
    } else {
      // assume no parentId means we are adding a component to root schema
      updates.child = newComponentId;
    }

    return updates;
  }
}

export default SchemaUtils;
