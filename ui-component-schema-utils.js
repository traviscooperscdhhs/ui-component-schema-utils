'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _immutable = require('immutable');

/**
 * Sometimes we want to set a schema value to something that might
 * not exist, but we dont want the result to be "undefined" as that would
 * effectively "delete" the value.
 */

var _immutable2 = _interopRequireDefault(_immutable);

'use-strict';
function maybe(value) {
  return value || null;
}

/**
 * A collection of static methods for operating on component schema data.
 * @class SchemaUtils
 */

var SchemaUtils = (function () {
  function SchemaUtils() {
    _classCallCheck(this, SchemaUtils);
  }

  _createClass(SchemaUtils, null, [{
    key: 'updateWorkflowState',

    /**
     * Update the visual state of workflow items.
     * @param {object} schema - entire workflow schema
     * @param {string} lastSectionCompleted - the previous section
     * @param {string} currentSection - the new active section
     * @returns {object}
     */
    value: function updateWorkflowState(schema, lastSectionCompleted, currentSection) {
      var _schema = _lodash2['default'].clone(schema);
      var hasVisitedLastSectionCompleted = false;
      SchemaUtils.traverse(_schema, schema.child, function (id, node) {
        var isCurrent = id === currentSection;
        node.config.disabled = !isCurrent && hasVisitedLastSectionCompleted;
        node.config.current = isCurrent;

        if (id === lastSectionCompleted) {
          hasVisitedLastSectionCompleted = true;
        }
      });

      return _schema;
    }

    /**
     * Perform visual state updates by examining the passed in model.
     * @param {object} model
     * @param {object} schema
     * @returns {object}
     */
  }, {
    key: 'updateSchemaWithModel',
    value: function updateSchemaWithModel(model, schema) {
      var updatedSchema = {};
      if (!_lodash2['default'].isEmpty(schema)) {
        var iSchema = _immutable2['default'].fromJS(schema);
        var components = iSchema.get('components').map(function (component, id) {
          if (component) {
            var _ret = (function () {
              var name = component.getIn(['config', 'name'], '');
              return {
                v: component.withMutations(function (_component) {
                  _component.setIn(['config', 'visible'], true);

                  // set field value
                  if (model.hasOwnProperty(name)) {
                    _component.setIn(['config', 'value'], model[name]);
                  } else if (_component.hasIn(['config', 'inputOperationConfig'])) {
                    var ioc = _component.getIn(['config', 'inputOperationConfig']).toJS();
                    var action = SchemaUtils[ioc.action];
                    _component.setIn(['config', 'value'], action(model, ioc));
                  }

                  // update dependent field state
                  if (_component.hasIn(['config', 'dependencyName'])) {
                    var dependencyName = _component.getIn(['config', 'dependencyName']);
                    var initialState = _component.getIn(['config', 'initialState']);
                    var dependencyType = _lodash2['default'].includes(initialState, 'disabled') || _lodash2['default'].includes(initialState, 'enabled') ? 'disabled' : 'visible';
                    var dependencyState = dependencyType === initialState ? true : false;
                    var expectedValues = _component.getIn(['config', 'dependencyValue']).split('|');
                    if (model.hasOwnProperty(dependencyName)) {
                      var depFieldValue = model[dependencyName];
                      depFieldValue = !Array.isArray(depFieldValue) ? [depFieldValue] : depFieldValue;
                      var fieldState = _lodash2['default'].intersection(expectedValues, depFieldValue).length > 0;
                      _component.setIn(['config', dependencyType], fieldState ? !dependencyState : dependencyState);
                    } else {
                      _component.setIn(['config', dependencyType], dependencyState);
                    }
                  }
                })
              };
            })();

            if (typeof _ret === 'object') return _ret.v;
          } else {
            return null;
          }
        });

        updatedSchema = iSchema.setIn(['components'], components).toJS();
      }

      return updatedSchema;
    }

    /**
     * Returns an updated model with concatonated field values from previous pages as
     * the current field's value
     * @param {object} model - Pass in the application model
     * @param {object} opConfig - Pass in a config with properties relevant to the operation
     * @return {object}
     */
  }, {
    key: 'composeFromFields',
    value: function composeFromFields(model, opConfig) {
      var fieldValues = _lodash2['default'].map(opConfig.fieldsArray, function (field) {
        return typeof field !== 'undefined' && model[field] !== undefined ? model[field] : null;
      });
      return fieldValues.join(' ');
    }

    /**
     * Return details for passed in componentId
     * @static
     * @param {object} schema
     * @param {object} componentId
     * @return {{id: *, previous: *, parent: *, next: *}}
     */
  }, {
    key: 'getMetaData',
    value: function getMetaData(schema, componentId) {
      var exists = _lodash2['default'].has(schema.components, componentId);
      return {
        id: componentId,
        previous: _lodash2['default'].findKey(schema.components, { next: componentId }),
        parent: _lodash2['default'].findKey(schema.components, { child: componentId }),
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
  }, {
    key: 'getRootId',
    value: function getRootId(schema, componentId) {
      var meta = SchemaUtils.getMetaData(schema, componentId);
      while (meta && !meta.parent && meta.previous) {
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
  }, {
    key: 'moveUp',
    value: function moveUp(schema, componentId) {
      var meta = SchemaUtils.getMetaData(schema, componentId);
      var updates = { components: {} };
      if (meta.previous) {
        var previousPreviousNext = _lodash2['default'].findKey(schema.components, { next: meta.previous });
        var previousPreviousChild = _lodash2['default'].findKey(schema.components, { child: meta.previous });

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
  }, {
    key: 'moveDown',
    value: function moveDown(schema, componentId) {
      var meta = SchemaUtils.getMetaData(schema, componentId);
      var updates = { components: {} };
      if (meta.next) {
        var nextNext = schema.components[meta.next].next;

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
  }, {
    key: 'nest',
    value: function nest(schema, componentId) {
      var meta = SchemaUtils.getMetaData(schema, componentId);
      var updates = { components: {} };
      if (meta.previous) {
        var previousChild = schema.components[meta.previous].child;
        if (previousChild) {
          var parentLastChild = SchemaUtils.getLastSiblingId(schema, previousChild);
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
  }, {
    key: 'unNest',
    value: function unNest(schema, componentId) {
      var meta = SchemaUtils.getMetaData(schema, componentId);
      var updates = { components: {} };
      var parent = meta.parent;
      var previous = meta.previous;

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
  }, {
    key: 'getLastSiblingId',
    value: function getLastSiblingId(schema, componentId) {
      var head = schema.components[componentId];
      var id = componentId;
      while (head.next) {
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
  }, {
    key: 'traverse',
    value: function traverse(schema, componentId, fn) {
      var head = schema.components[componentId];
      var id = componentId;
      while (head) {
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
  }, {
    key: 'removeComponent',
    value: function removeComponent(schema, componentId) {
      var meta = SchemaUtils.getMetaData(schema, componentId);
      var updates = { components: {} };

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
        SchemaUtils.traverse(schema, meta.child, function (id, components) {
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
  }, {
    key: 'addNewChildComponent',
    value: function addNewChildComponent(schema, parentId, childSchema) {
      var newComponentId = _lodash2['default'].camelCase([childSchema.config.name, childSchema.type].join(' '));
      var parent = parentId ? schema.components[parentId] : schema;
      var updates = {
        components: _defineProperty({}, newComponentId, _immutable2['default'].fromJS(childSchema).setIn(['config', 'id'], newComponentId).toJSON())
      };

      // if the parent already has children, set the new component as the last child
      // NOTE: parent could be a root schema with children
      if (parent.child) {
        var lastSibling = SchemaUtils.getLastSiblingId(schema, parent.child);
        updates.components[lastSibling] = {
          next: newComponentId
        };
      } else if (parentId) {
        // parent is a new parent without existing children
        updates.components[parentId] = { child: newComponentId };
      } else {
        // assume no parentId means we are adding a component to root schema
        updates.child = newComponentId;
      }

      return updates;
    }
  }]);

  return SchemaUtils;
})();

exports['default'] = SchemaUtils;
module.exports = exports['default'];
