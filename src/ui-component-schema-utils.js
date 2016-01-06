'use-strict';
import _ from 'lodash';
import Immutable from 'immutable';

/**
 * Sometimes we want to set a schema value to something that might
 * not exist, but we dont want the result to be "undefined" as that would
 * effectively "delete" the value.
 */
function maybe(value) {
  return value || null;
}

/**
 * A collection of static methods for operating on component schema data.
 * @class SchemaUtils
 */
class SchemaUtils {

  /**
   * Update the visual state of workflow items.
   * @param {object} schema - entire workflow schema
   * @param {string} lastSectionCompleted - the previous section
   * @param {string} currentSection - the new active section
   * @returns {object}
   */
  static updateWorkflowState(schema, lastSectionCompleted, currentSection) {
    let _schema = _.clone(schema);
    let hasVisitedLastSectionCompleted = false;
    SchemaUtils.traverse(_schema, schema.child, (id, node) => {
      let isCurrent = (id === currentSection);
      node.config.disabled = (!isCurrent && hasVisitedLastSectionCompleted);
      node.config.current = isCurrent;

      if (id === lastSectionCompleted) {
        hasVisitedLastSectionCompleted = true;
      }
    });

    return _schema;
  }

  /**
   * Perform visual state updates by examining the passed in model.
   * Returns 'schema' with merged model/config data, and 'updates' that contains
   * the fields whose values were composed and thus need to be updated upstream
   * @param {object} model
   * @param {object} schema
   * @param {string} pageId
   * @returns {object}
   */
  static updateSchemaWithModel(input, schema, pageId) {
    let model = input[pageId] || {};
    let updatedSchema = {};
    let updates = {};
    if (!_.isEmpty(schema)) {
      let iSchema = Immutable.fromJS(schema);
      let components = iSchema.get('components').map((component, id) => {
        if (component) {
          let name = component.getIn(['config', 'name'], '');
          return component.withMutations((_component) => {
            _component.setIn(['config', 'visible'], true);

            // set field value
            if (model.hasOwnProperty(name)) {
              _component.setIn(['config', 'value'], model[name]);
            }
            // Composed values should be 'recomposed' even if they have a current value
            if (_component.hasIn(['config', 'inputOperationConfig'])) {
              let ioc = _component.getIn(['config', 'inputOperationConfig']).toJS();
              let action = SchemaUtils[ioc.action];
              let compositeValue = action(input, ioc);
              _component.setIn(['config', 'value'], compositeValue);
              updates[name] = compositeValue;
            } else if (_component.getIn(['config', 'type']) === 'date' && _component.getIn(['config', 'value']) === 'today') {
              let dateValue = new Date();
              _component.setIn(['config', 'value'], dateValue);
              updates[name] = dateValue;
            }

            // update dependent field state
            if (_component.hasIn(['config', 'dependencyName'])) {
              let dependencyName = _component.getIn(['config', 'dependencyName']);
              let initialState = _component.getIn(['config', 'initialState']);
              let dependencyType = _.includes(initialState, 'disabled') || _.includes(initialState, 'enabled') ? 'disabled' : 'visible';
              let dependencyState = dependencyType === initialState ? true : false;
              let expectedValues = _component.getIn(['config', 'dependencyValue']).split('|');
              if (model.hasOwnProperty(dependencyName)) {
                let depFieldValue = model[dependencyName];
                depFieldValue = !Array.isArray(depFieldValue) ? [depFieldValue] : depFieldValue;
                let fieldState = _.intersection(expectedValues, depFieldValue).length > 0;
                _component.setIn(['config', dependencyType], fieldState ? !dependencyState : dependencyState);
              } else {
                _component.setIn(['config', dependencyType], dependencyState);
              }
            }
          });

        } else {
          return null;
        }
      });

      updatedSchema = iSchema.setIn(['components'], components).toJS();
    }

    return {schema: updatedSchema, updates};
  }

  /**
   * Returns an updated model with concatonated field values from previous pages as
   * the current field's value
   * @param {object} applicationInput - Pass in the application input
   * @param {object} opConfig - Pass in a config with properties relevant to the operation
   * @return {object}
   */
  static composeFromFields(applicationInput, opConfig) {
    let fieldValues = [];
    if (applicationInput) {
      let input = Immutable.fromJS(applicationInput);
      fieldValues = _.filter(_.map(opConfig.fieldsArray, (field) => {
          return input.hasIn([field.page, field.id]) ? input.getIn([field.page, field.id]) : null;
      }), (field) => (field !== null));
    }
    return fieldValues.join(' ');
  }

  /**
   * Return details for passed in componentId
   * @static
   * @param {object} schema
   * @param {object} componentId
   * @return {{id: *, previous: *, parent: *, next: *}}
   */
  static getMetaData(schema, componentId) {
    let exists = _.has(schema.components, componentId);
    return {
      id: componentId,
      previous: _.findKey(schema.components, {next: componentId}),
      parent: _.findKey(schema.components, {child: componentId}),
      next: exists ? schema.components[componentId].next : null,
      child: exists ? schema.components[componentId].child : null
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
  static getRootId(schema, componentId) {
    let meta = SchemaUtils.getMetaData(schema, componentId);
    while(meta && !meta.parent && meta.previous) {
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
  static moveUp(schema, componentId) {
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = {components: {}};
    if (meta.previous) {
      let previousPreviousNext = _.findKey(schema.components, {next: meta.previous});
      let previousPreviousChild = _.findKey(schema.components, {child: meta.previous});

      // 1. Parent previous 'next' needs to point to ME
      if (previousPreviousNext) {
        updates.components[previousPreviousNext] = {
          next: meta.id
        };
      } else if (previousPreviousChild) {
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
  static moveDown(schema, componentId) {
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = {components: {}};
    if (meta.next) {
      let nextNext = schema.components[meta.next].next;

      // 1. my previous 'next' points to my next
      if (meta.previous) {
        updates.components[meta.previous] = {
          next: meta.next
        };
      } else if (meta.parent) {
        updates.components[meta.parent] = {
          child: meta.next
        };
      } else {
        // If I'm the first page, update the workflow child to point to my next.
        updates.child = meta.next;
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
  static nest(schema, componentId) {
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = {components: {}};
    if (meta.previous) {
      let previousChild = schema.components[meta.previous].child;
      if (previousChild) {
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
  static unNest(schema, componentId) {
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = {components: {}};
    let parent = meta.parent;
    let previous = meta.previous;

    if (parent) {
      updates.components[parent] = {
        child: meta.next,
        next: meta.id
      };
    } else {
      parent = SchemaUtils.getRootId(schema, previous);
      updates.components[parent] = {
        next: meta.id
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
  static getLastSiblingId(schema, componentId) {
    let head = schema.components[componentId];
    let id = componentId;
    while(head.next) {
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
  static traverse(schema, componentId, fn) {
    let head = schema.components[componentId];
    let id = componentId;
    while(head) {
      fn(id, head);
      if (head.child) {
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
  static removeComponent(schema, componentId) {
    let meta = SchemaUtils.getMetaData(schema, componentId);
    let updates = {components: {}};

    // nullify the passed in componentId
    updates.components[componentId] = null;

    // take the component that points to me and make it
    // point to my next sibling instead
    if (meta.previous) {
      updates.components[meta.previous] = {
        next: maybe(meta.next)
      };
    } else if (meta.parent) {
      // if I am a direct child, point my parent to my next sibling
      updates.components[meta.parent] = {
        child: maybe(meta.next)
      };
    } else if (schema.child === componentId) {
      // if I am the direct child of the parent schema, point to
      // my next sibling
      updates.child = maybe(meta.next);
    }

    // remove any child components
    if (meta.child) {
      SchemaUtils.traverse(schema, meta.child, function(id, components) {
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
  static addNewChildComponent(schema, parentId, childSchema) {
    let newComponentId = _.camelCase([childSchema.config.name, childSchema.type].join(' '));
    let parent = parentId ? schema.components[parentId] : schema;
    let updates = {
      components: {
        [newComponentId]: Immutable.fromJS(childSchema).setIn(['config', 'id'], newComponentId).toJSON()
      }
    };

    // if the parent already has children, set the new component as the last child
    // NOTE: parent could be a root schema with children
    if (parent.child) {
      let lastSibling = SchemaUtils.getLastSiblingId(schema, parent.child);
      updates.components[lastSibling] = {
        next: newComponentId
      };
    } else if (parentId) {
      // parent is a new parent without existing children
      updates.components[parentId] = {child: newComponentId};
    } else {
      // assume no parentId means we are adding a component to root schema
      updates.child = newComponentId;
    }

    return updates;
  }
}

export default SchemaUtils;
