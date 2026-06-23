"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // ../node_modules/react/cjs/react.production.min.js
  var require_react_production_min = __commonJS({
    "../node_modules/react/cjs/react.production.min.js"(exports) {
      "use strict";
      var l = Symbol.for("react.element");
      var n = Symbol.for("react.portal");
      var p = Symbol.for("react.fragment");
      var q = Symbol.for("react.strict_mode");
      var r = Symbol.for("react.profiler");
      var t = Symbol.for("react.provider");
      var u = Symbol.for("react.context");
      var v = Symbol.for("react.forward_ref");
      var w = Symbol.for("react.suspense");
      var x = Symbol.for("react.memo");
      var y = Symbol.for("react.lazy");
      var z = Symbol.iterator;
      function A(a) {
        if (null === a || "object" !== typeof a)
          return null;
        a = z && a[z] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var B = { isMounted: function() {
        return false;
      }, enqueueForceUpdate: function() {
      }, enqueueReplaceState: function() {
      }, enqueueSetState: function() {
      } };
      var C = Object.assign;
      var D = {};
      function E(a, b, e) {
        this.props = a;
        this.context = b;
        this.refs = D;
        this.updater = e || B;
      }
      E.prototype.isReactComponent = {};
      E.prototype.setState = function(a, b) {
        if ("object" !== typeof a && "function" !== typeof a && null != a)
          throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
        this.updater.enqueueSetState(this, a, b, "setState");
      };
      E.prototype.forceUpdate = function(a) {
        this.updater.enqueueForceUpdate(this, a, "forceUpdate");
      };
      function F() {
      }
      F.prototype = E.prototype;
      function G(a, b, e) {
        this.props = a;
        this.context = b;
        this.refs = D;
        this.updater = e || B;
      }
      var H = G.prototype = new F();
      H.constructor = G;
      C(H, E.prototype);
      H.isPureReactComponent = true;
      var I = Array.isArray;
      var J = Object.prototype.hasOwnProperty;
      var K = { current: null };
      var L = { key: true, ref: true, __self: true, __source: true };
      function M(a, b, e) {
        var d, c = {}, k = null, h = null;
        if (null != b)
          for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b)
            J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
        var g = arguments.length - 2;
        if (1 === g)
          c.children = e;
        else if (1 < g) {
          for (var f = Array(g), m = 0; m < g; m++)
            f[m] = arguments[m + 2];
          c.children = f;
        }
        if (a && a.defaultProps)
          for (d in g = a.defaultProps, g)
            void 0 === c[d] && (c[d] = g[d]);
        return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
      }
      function N(a, b) {
        return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
      }
      function O(a) {
        return "object" === typeof a && null !== a && a.$$typeof === l;
      }
      function escape(a) {
        var b = { "=": "=0", ":": "=2" };
        return "$" + a.replace(/[=:]/g, function(a2) {
          return b[a2];
        });
      }
      var P = /\/+/g;
      function Q(a, b) {
        return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
      }
      function R(a, b, e, d, c) {
        var k = typeof a;
        if ("undefined" === k || "boolean" === k)
          a = null;
        var h = false;
        if (null === a)
          h = true;
        else
          switch (k) {
            case "string":
            case "number":
              h = true;
              break;
            case "object":
              switch (a.$$typeof) {
                case l:
                case n:
                  h = true;
              }
          }
        if (h)
          return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
            return a2;
          })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
        h = 0;
        d = "" === d ? "." : d + ":";
        if (I(a))
          for (var g = 0; g < a.length; g++) {
            k = a[g];
            var f = d + Q(k, g);
            h += R(k, b, e, f, c);
          }
        else if (f = A(a), "function" === typeof f)
          for (a = f.call(a), g = 0; !(k = a.next()).done; )
            k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
        else if ("object" === k)
          throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
        return h;
      }
      function S(a, b, e) {
        if (null == a)
          return a;
        var d = [], c = 0;
        R(a, d, "", "", function(a2) {
          return b.call(e, a2, c++);
        });
        return d;
      }
      function T(a) {
        if (-1 === a._status) {
          var b = a._result;
          b = b();
          b.then(function(b2) {
            if (0 === a._status || -1 === a._status)
              a._status = 1, a._result = b2;
          }, function(b2) {
            if (0 === a._status || -1 === a._status)
              a._status = 2, a._result = b2;
          });
          -1 === a._status && (a._status = 0, a._result = b);
        }
        if (1 === a._status)
          return a._result.default;
        throw a._result;
      }
      var U = { current: null };
      var V = { transition: null };
      var W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
      function X() {
        throw Error("act(...) is not supported in production builds of React.");
      }
      exports.Children = { map: S, forEach: function(a, b, e) {
        S(a, function() {
          b.apply(this, arguments);
        }, e);
      }, count: function(a) {
        var b = 0;
        S(a, function() {
          b++;
        });
        return b;
      }, toArray: function(a) {
        return S(a, function(a2) {
          return a2;
        }) || [];
      }, only: function(a) {
        if (!O(a))
          throw Error("React.Children.only expected to receive a single React element child.");
        return a;
      } };
      exports.Component = E;
      exports.Fragment = p;
      exports.Profiler = r;
      exports.PureComponent = G;
      exports.StrictMode = q;
      exports.Suspense = w;
      exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
      exports.act = X;
      exports.cloneElement = function(a, b, e) {
        if (null === a || void 0 === a)
          throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
        var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
        if (null != b) {
          void 0 !== b.ref && (k = b.ref, h = K.current);
          void 0 !== b.key && (c = "" + b.key);
          if (a.type && a.type.defaultProps)
            var g = a.type.defaultProps;
          for (f in b)
            J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
        }
        var f = arguments.length - 2;
        if (1 === f)
          d.children = e;
        else if (1 < f) {
          g = Array(f);
          for (var m = 0; m < f; m++)
            g[m] = arguments[m + 2];
          d.children = g;
        }
        return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
      };
      exports.createContext = function(a) {
        a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
        a.Provider = { $$typeof: t, _context: a };
        return a.Consumer = a;
      };
      exports.createElement = M;
      exports.createFactory = function(a) {
        var b = M.bind(null, a);
        b.type = a;
        return b;
      };
      exports.createRef = function() {
        return { current: null };
      };
      exports.forwardRef = function(a) {
        return { $$typeof: v, render: a };
      };
      exports.isValidElement = O;
      exports.lazy = function(a) {
        return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
      };
      exports.memo = function(a, b) {
        return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
      };
      exports.startTransition = function(a) {
        var b = V.transition;
        V.transition = {};
        try {
          a();
        } finally {
          V.transition = b;
        }
      };
      exports.unstable_act = X;
      exports.useCallback = function(a, b) {
        return U.current.useCallback(a, b);
      };
      exports.useContext = function(a) {
        return U.current.useContext(a);
      };
      exports.useDebugValue = function() {
      };
      exports.useDeferredValue = function(a) {
        return U.current.useDeferredValue(a);
      };
      exports.useEffect = function(a, b) {
        return U.current.useEffect(a, b);
      };
      exports.useId = function() {
        return U.current.useId();
      };
      exports.useImperativeHandle = function(a, b, e) {
        return U.current.useImperativeHandle(a, b, e);
      };
      exports.useInsertionEffect = function(a, b) {
        return U.current.useInsertionEffect(a, b);
      };
      exports.useLayoutEffect = function(a, b) {
        return U.current.useLayoutEffect(a, b);
      };
      exports.useMemo = function(a, b) {
        return U.current.useMemo(a, b);
      };
      exports.useReducer = function(a, b, e) {
        return U.current.useReducer(a, b, e);
      };
      exports.useRef = function(a) {
        return U.current.useRef(a);
      };
      exports.useState = function(a) {
        return U.current.useState(a);
      };
      exports.useSyncExternalStore = function(a, b, e) {
        return U.current.useSyncExternalStore(a, b, e);
      };
      exports.useTransition = function() {
        return U.current.useTransition();
      };
      exports.version = "18.3.1";
    }
  });

  // ../node_modules/react/index.js
  var require_react = __commonJS({
    "../node_modules/react/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_react_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // ../node_modules/scheduler/cjs/scheduler.production.min.js
  var require_scheduler_production_min = __commonJS({
    "../node_modules/scheduler/cjs/scheduler.production.min.js"(exports) {
      "use strict";
      function f(a, b) {
        var c = a.length;
        a.push(b);
        a:
          for (; 0 < c; ) {
            var d = c - 1 >>> 1, e = a[d];
            if (0 < g(e, b))
              a[d] = b, a[c] = e, c = d;
            else
              break a;
          }
      }
      function h(a) {
        return 0 === a.length ? null : a[0];
      }
      function k(a) {
        if (0 === a.length)
          return null;
        var b = a[0], c = a.pop();
        if (c !== b) {
          a[0] = c;
          a:
            for (var d = 0, e = a.length, w = e >>> 1; d < w; ) {
              var m = 2 * (d + 1) - 1, C = a[m], n = m + 1, x = a[n];
              if (0 > g(C, c))
                n < e && 0 > g(x, C) ? (a[d] = x, a[n] = c, d = n) : (a[d] = C, a[m] = c, d = m);
              else if (n < e && 0 > g(x, c))
                a[d] = x, a[n] = c, d = n;
              else
                break a;
            }
        }
        return b;
      }
      function g(a, b) {
        var c = a.sortIndex - b.sortIndex;
        return 0 !== c ? c : a.id - b.id;
      }
      if ("object" === typeof performance && "function" === typeof performance.now) {
        l = performance;
        exports.unstable_now = function() {
          return l.now();
        };
      } else {
        p = Date, q = p.now();
        exports.unstable_now = function() {
          return p.now() - q;
        };
      }
      var l;
      var p;
      var q;
      var r = [];
      var t = [];
      var u = 1;
      var v = null;
      var y = 3;
      var z = false;
      var A = false;
      var B = false;
      var D = "function" === typeof setTimeout ? setTimeout : null;
      var E = "function" === typeof clearTimeout ? clearTimeout : null;
      var F = "undefined" !== typeof setImmediate ? setImmediate : null;
      "undefined" !== typeof navigator && void 0 !== navigator.scheduling && void 0 !== navigator.scheduling.isInputPending && navigator.scheduling.isInputPending.bind(navigator.scheduling);
      function G(a) {
        for (var b = h(t); null !== b; ) {
          if (null === b.callback)
            k(t);
          else if (b.startTime <= a)
            k(t), b.sortIndex = b.expirationTime, f(r, b);
          else
            break;
          b = h(t);
        }
      }
      function H(a) {
        B = false;
        G(a);
        if (!A)
          if (null !== h(r))
            A = true, I(J);
          else {
            var b = h(t);
            null !== b && K(H, b.startTime - a);
          }
      }
      function J(a, b) {
        A = false;
        B && (B = false, E(L), L = -1);
        z = true;
        var c = y;
        try {
          G(b);
          for (v = h(r); null !== v && (!(v.expirationTime > b) || a && !M()); ) {
            var d = v.callback;
            if ("function" === typeof d) {
              v.callback = null;
              y = v.priorityLevel;
              var e = d(v.expirationTime <= b);
              b = exports.unstable_now();
              "function" === typeof e ? v.callback = e : v === h(r) && k(r);
              G(b);
            } else
              k(r);
            v = h(r);
          }
          if (null !== v)
            var w = true;
          else {
            var m = h(t);
            null !== m && K(H, m.startTime - b);
            w = false;
          }
          return w;
        } finally {
          v = null, y = c, z = false;
        }
      }
      var N = false;
      var O = null;
      var L = -1;
      var P = 5;
      var Q = -1;
      function M() {
        return exports.unstable_now() - Q < P ? false : true;
      }
      function R() {
        if (null !== O) {
          var a = exports.unstable_now();
          Q = a;
          var b = true;
          try {
            b = O(true, a);
          } finally {
            b ? S() : (N = false, O = null);
          }
        } else
          N = false;
      }
      var S;
      if ("function" === typeof F)
        S = function() {
          F(R);
        };
      else if ("undefined" !== typeof MessageChannel) {
        T = new MessageChannel(), U = T.port2;
        T.port1.onmessage = R;
        S = function() {
          U.postMessage(null);
        };
      } else
        S = function() {
          D(R, 0);
        };
      var T;
      var U;
      function I(a) {
        O = a;
        N || (N = true, S());
      }
      function K(a, b) {
        L = D(function() {
          a(exports.unstable_now());
        }, b);
      }
      exports.unstable_IdlePriority = 5;
      exports.unstable_ImmediatePriority = 1;
      exports.unstable_LowPriority = 4;
      exports.unstable_NormalPriority = 3;
      exports.unstable_Profiling = null;
      exports.unstable_UserBlockingPriority = 2;
      exports.unstable_cancelCallback = function(a) {
        a.callback = null;
      };
      exports.unstable_continueExecution = function() {
        A || z || (A = true, I(J));
      };
      exports.unstable_forceFrameRate = function(a) {
        0 > a || 125 < a ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P = 0 < a ? Math.floor(1e3 / a) : 5;
      };
      exports.unstable_getCurrentPriorityLevel = function() {
        return y;
      };
      exports.unstable_getFirstCallbackNode = function() {
        return h(r);
      };
      exports.unstable_next = function(a) {
        switch (y) {
          case 1:
          case 2:
          case 3:
            var b = 3;
            break;
          default:
            b = y;
        }
        var c = y;
        y = b;
        try {
          return a();
        } finally {
          y = c;
        }
      };
      exports.unstable_pauseExecution = function() {
      };
      exports.unstable_requestPaint = function() {
      };
      exports.unstable_runWithPriority = function(a, b) {
        switch (a) {
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
            break;
          default:
            a = 3;
        }
        var c = y;
        y = a;
        try {
          return b();
        } finally {
          y = c;
        }
      };
      exports.unstable_scheduleCallback = function(a, b, c) {
        var d = exports.unstable_now();
        "object" === typeof c && null !== c ? (c = c.delay, c = "number" === typeof c && 0 < c ? d + c : d) : c = d;
        switch (a) {
          case 1:
            var e = -1;
            break;
          case 2:
            e = 250;
            break;
          case 5:
            e = 1073741823;
            break;
          case 4:
            e = 1e4;
            break;
          default:
            e = 5e3;
        }
        e = c + e;
        a = { id: u++, callback: b, priorityLevel: a, startTime: c, expirationTime: e, sortIndex: -1 };
        c > d ? (a.sortIndex = c, f(t, a), null === h(r) && a === h(t) && (B ? (E(L), L = -1) : B = true, K(H, c - d))) : (a.sortIndex = e, f(r, a), A || z || (A = true, I(J)));
        return a;
      };
      exports.unstable_shouldYield = M;
      exports.unstable_wrapCallback = function(a) {
        var b = y;
        return function() {
          var c = y;
          y = b;
          try {
            return a.apply(this, arguments);
          } finally {
            y = c;
          }
        };
      };
    }
  });

  // ../node_modules/scheduler/index.js
  var require_scheduler = __commonJS({
    "../node_modules/scheduler/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_scheduler_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // ../node_modules/react-dom/cjs/react-dom.production.min.js
  var require_react_dom_production_min = __commonJS({
    "../node_modules/react-dom/cjs/react-dom.production.min.js"(exports) {
      "use strict";
      var aa = require_react();
      var ca = require_scheduler();
      function p(a) {
        for (var b = "https://reactjs.org/docs/error-decoder.html?invariant=" + a, c = 1; c < arguments.length; c++)
          b += "&args[]=" + encodeURIComponent(arguments[c]);
        return "Minified React error #" + a + "; visit " + b + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
      }
      var da = /* @__PURE__ */ new Set();
      var ea = {};
      function fa(a, b) {
        ha(a, b);
        ha(a + "Capture", b);
      }
      function ha(a, b) {
        ea[a] = b;
        for (a = 0; a < b.length; a++)
          da.add(b[a]);
      }
      var ia = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
      var ja = Object.prototype.hasOwnProperty;
      var ka = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/;
      var la = {};
      var ma = {};
      function oa(a) {
        if (ja.call(ma, a))
          return true;
        if (ja.call(la, a))
          return false;
        if (ka.test(a))
          return ma[a] = true;
        la[a] = true;
        return false;
      }
      function pa(a, b, c, d) {
        if (null !== c && 0 === c.type)
          return false;
        switch (typeof b) {
          case "function":
          case "symbol":
            return true;
          case "boolean":
            if (d)
              return false;
            if (null !== c)
              return !c.acceptsBooleans;
            a = a.toLowerCase().slice(0, 5);
            return "data-" !== a && "aria-" !== a;
          default:
            return false;
        }
      }
      function qa(a, b, c, d) {
        if (null === b || "undefined" === typeof b || pa(a, b, c, d))
          return true;
        if (d)
          return false;
        if (null !== c)
          switch (c.type) {
            case 3:
              return !b;
            case 4:
              return false === b;
            case 5:
              return isNaN(b);
            case 6:
              return isNaN(b) || 1 > b;
          }
        return false;
      }
      function v(a, b, c, d, e, f, g) {
        this.acceptsBooleans = 2 === b || 3 === b || 4 === b;
        this.attributeName = d;
        this.attributeNamespace = e;
        this.mustUseProperty = c;
        this.propertyName = a;
        this.type = b;
        this.sanitizeURL = f;
        this.removeEmptyString = g;
      }
      var z = {};
      "children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a) {
        z[a] = new v(a, 0, false, a, null, false, false);
      });
      [["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(a) {
        var b = a[0];
        z[b] = new v(b, 1, false, a[1], null, false, false);
      });
      ["contentEditable", "draggable", "spellCheck", "value"].forEach(function(a) {
        z[a] = new v(a, 2, false, a.toLowerCase(), null, false, false);
      });
      ["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(a) {
        z[a] = new v(a, 2, false, a, null, false, false);
      });
      "allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a) {
        z[a] = new v(a, 3, false, a.toLowerCase(), null, false, false);
      });
      ["checked", "multiple", "muted", "selected"].forEach(function(a) {
        z[a] = new v(a, 3, true, a, null, false, false);
      });
      ["capture", "download"].forEach(function(a) {
        z[a] = new v(a, 4, false, a, null, false, false);
      });
      ["cols", "rows", "size", "span"].forEach(function(a) {
        z[a] = new v(a, 6, false, a, null, false, false);
      });
      ["rowSpan", "start"].forEach(function(a) {
        z[a] = new v(a, 5, false, a.toLowerCase(), null, false, false);
      });
      var ra = /[\-:]([a-z])/g;
      function sa(a) {
        return a[1].toUpperCase();
      }
      "accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a) {
        var b = a.replace(
          ra,
          sa
        );
        z[b] = new v(b, 1, false, a, null, false, false);
      });
      "xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a) {
        var b = a.replace(ra, sa);
        z[b] = new v(b, 1, false, a, "http://www.w3.org/1999/xlink", false, false);
      });
      ["xml:base", "xml:lang", "xml:space"].forEach(function(a) {
        var b = a.replace(ra, sa);
        z[b] = new v(b, 1, false, a, "http://www.w3.org/XML/1998/namespace", false, false);
      });
      ["tabIndex", "crossOrigin"].forEach(function(a) {
        z[a] = new v(a, 1, false, a.toLowerCase(), null, false, false);
      });
      z.xlinkHref = new v("xlinkHref", 1, false, "xlink:href", "http://www.w3.org/1999/xlink", true, false);
      ["src", "href", "action", "formAction"].forEach(function(a) {
        z[a] = new v(a, 1, false, a.toLowerCase(), null, true, true);
      });
      function ta(a, b, c, d) {
        var e = z.hasOwnProperty(b) ? z[b] : null;
        if (null !== e ? 0 !== e.type : d || !(2 < b.length) || "o" !== b[0] && "O" !== b[0] || "n" !== b[1] && "N" !== b[1])
          qa(b, c, e, d) && (c = null), d || null === e ? oa(b) && (null === c ? a.removeAttribute(b) : a.setAttribute(b, "" + c)) : e.mustUseProperty ? a[e.propertyName] = null === c ? 3 === e.type ? false : "" : c : (b = e.attributeName, d = e.attributeNamespace, null === c ? a.removeAttribute(b) : (e = e.type, c = 3 === e || 4 === e && true === c ? "" : "" + c, d ? a.setAttributeNS(d, b, c) : a.setAttribute(b, c)));
      }
      var ua = aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
      var va = Symbol.for("react.element");
      var wa = Symbol.for("react.portal");
      var ya = Symbol.for("react.fragment");
      var za = Symbol.for("react.strict_mode");
      var Aa = Symbol.for("react.profiler");
      var Ba = Symbol.for("react.provider");
      var Ca = Symbol.for("react.context");
      var Da = Symbol.for("react.forward_ref");
      var Ea = Symbol.for("react.suspense");
      var Fa = Symbol.for("react.suspense_list");
      var Ga = Symbol.for("react.memo");
      var Ha = Symbol.for("react.lazy");
      Symbol.for("react.scope");
      Symbol.for("react.debug_trace_mode");
      var Ia = Symbol.for("react.offscreen");
      Symbol.for("react.legacy_hidden");
      Symbol.for("react.cache");
      Symbol.for("react.tracing_marker");
      var Ja = Symbol.iterator;
      function Ka(a) {
        if (null === a || "object" !== typeof a)
          return null;
        a = Ja && a[Ja] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var A = Object.assign;
      var La;
      function Ma(a) {
        if (void 0 === La)
          try {
            throw Error();
          } catch (c) {
            var b = c.stack.trim().match(/\n( *(at )?)/);
            La = b && b[1] || "";
          }
        return "\n" + La + a;
      }
      var Na = false;
      function Oa(a, b) {
        if (!a || Na)
          return "";
        Na = true;
        var c = Error.prepareStackTrace;
        Error.prepareStackTrace = void 0;
        try {
          if (b)
            if (b = function() {
              throw Error();
            }, Object.defineProperty(b.prototype, "props", { set: function() {
              throw Error();
            } }), "object" === typeof Reflect && Reflect.construct) {
              try {
                Reflect.construct(b, []);
              } catch (l) {
                var d = l;
              }
              Reflect.construct(a, [], b);
            } else {
              try {
                b.call();
              } catch (l) {
                d = l;
              }
              a.call(b.prototype);
            }
          else {
            try {
              throw Error();
            } catch (l) {
              d = l;
            }
            a();
          }
        } catch (l) {
          if (l && d && "string" === typeof l.stack) {
            for (var e = l.stack.split("\n"), f = d.stack.split("\n"), g = e.length - 1, h = f.length - 1; 1 <= g && 0 <= h && e[g] !== f[h]; )
              h--;
            for (; 1 <= g && 0 <= h; g--, h--)
              if (e[g] !== f[h]) {
                if (1 !== g || 1 !== h) {
                  do
                    if (g--, h--, 0 > h || e[g] !== f[h]) {
                      var k = "\n" + e[g].replace(" at new ", " at ");
                      a.displayName && k.includes("<anonymous>") && (k = k.replace("<anonymous>", a.displayName));
                      return k;
                    }
                  while (1 <= g && 0 <= h);
                }
                break;
              }
          }
        } finally {
          Na = false, Error.prepareStackTrace = c;
        }
        return (a = a ? a.displayName || a.name : "") ? Ma(a) : "";
      }
      function Pa(a) {
        switch (a.tag) {
          case 5:
            return Ma(a.type);
          case 16:
            return Ma("Lazy");
          case 13:
            return Ma("Suspense");
          case 19:
            return Ma("SuspenseList");
          case 0:
          case 2:
          case 15:
            return a = Oa(a.type, false), a;
          case 11:
            return a = Oa(a.type.render, false), a;
          case 1:
            return a = Oa(a.type, true), a;
          default:
            return "";
        }
      }
      function Qa(a) {
        if (null == a)
          return null;
        if ("function" === typeof a)
          return a.displayName || a.name || null;
        if ("string" === typeof a)
          return a;
        switch (a) {
          case ya:
            return "Fragment";
          case wa:
            return "Portal";
          case Aa:
            return "Profiler";
          case za:
            return "StrictMode";
          case Ea:
            return "Suspense";
          case Fa:
            return "SuspenseList";
        }
        if ("object" === typeof a)
          switch (a.$$typeof) {
            case Ca:
              return (a.displayName || "Context") + ".Consumer";
            case Ba:
              return (a._context.displayName || "Context") + ".Provider";
            case Da:
              var b = a.render;
              a = a.displayName;
              a || (a = b.displayName || b.name || "", a = "" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
              return a;
            case Ga:
              return b = a.displayName || null, null !== b ? b : Qa(a.type) || "Memo";
            case Ha:
              b = a._payload;
              a = a._init;
              try {
                return Qa(a(b));
              } catch (c) {
              }
          }
        return null;
      }
      function Ra(a) {
        var b = a.type;
        switch (a.tag) {
          case 24:
            return "Cache";
          case 9:
            return (b.displayName || "Context") + ".Consumer";
          case 10:
            return (b._context.displayName || "Context") + ".Provider";
          case 18:
            return "DehydratedFragment";
          case 11:
            return a = b.render, a = a.displayName || a.name || "", b.displayName || ("" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
          case 7:
            return "Fragment";
          case 5:
            return b;
          case 4:
            return "Portal";
          case 3:
            return "Root";
          case 6:
            return "Text";
          case 16:
            return Qa(b);
          case 8:
            return b === za ? "StrictMode" : "Mode";
          case 22:
            return "Offscreen";
          case 12:
            return "Profiler";
          case 21:
            return "Scope";
          case 13:
            return "Suspense";
          case 19:
            return "SuspenseList";
          case 25:
            return "TracingMarker";
          case 1:
          case 0:
          case 17:
          case 2:
          case 14:
          case 15:
            if ("function" === typeof b)
              return b.displayName || b.name || null;
            if ("string" === typeof b)
              return b;
        }
        return null;
      }
      function Sa(a) {
        switch (typeof a) {
          case "boolean":
          case "number":
          case "string":
          case "undefined":
            return a;
          case "object":
            return a;
          default:
            return "";
        }
      }
      function Ta(a) {
        var b = a.type;
        return (a = a.nodeName) && "input" === a.toLowerCase() && ("checkbox" === b || "radio" === b);
      }
      function Ua(a) {
        var b = Ta(a) ? "checked" : "value", c = Object.getOwnPropertyDescriptor(a.constructor.prototype, b), d = "" + a[b];
        if (!a.hasOwnProperty(b) && "undefined" !== typeof c && "function" === typeof c.get && "function" === typeof c.set) {
          var e = c.get, f = c.set;
          Object.defineProperty(a, b, { configurable: true, get: function() {
            return e.call(this);
          }, set: function(a2) {
            d = "" + a2;
            f.call(this, a2);
          } });
          Object.defineProperty(a, b, { enumerable: c.enumerable });
          return { getValue: function() {
            return d;
          }, setValue: function(a2) {
            d = "" + a2;
          }, stopTracking: function() {
            a._valueTracker = null;
            delete a[b];
          } };
        }
      }
      function Va(a) {
        a._valueTracker || (a._valueTracker = Ua(a));
      }
      function Wa(a) {
        if (!a)
          return false;
        var b = a._valueTracker;
        if (!b)
          return true;
        var c = b.getValue();
        var d = "";
        a && (d = Ta(a) ? a.checked ? "true" : "false" : a.value);
        a = d;
        return a !== c ? (b.setValue(a), true) : false;
      }
      function Xa(a) {
        a = a || ("undefined" !== typeof document ? document : void 0);
        if ("undefined" === typeof a)
          return null;
        try {
          return a.activeElement || a.body;
        } catch (b) {
          return a.body;
        }
      }
      function Ya(a, b) {
        var c = b.checked;
        return A({}, b, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: null != c ? c : a._wrapperState.initialChecked });
      }
      function Za(a, b) {
        var c = null == b.defaultValue ? "" : b.defaultValue, d = null != b.checked ? b.checked : b.defaultChecked;
        c = Sa(null != b.value ? b.value : c);
        a._wrapperState = { initialChecked: d, initialValue: c, controlled: "checkbox" === b.type || "radio" === b.type ? null != b.checked : null != b.value };
      }
      function ab(a, b) {
        b = b.checked;
        null != b && ta(a, "checked", b, false);
      }
      function bb(a, b) {
        ab(a, b);
        var c = Sa(b.value), d = b.type;
        if (null != c)
          if ("number" === d) {
            if (0 === c && "" === a.value || a.value != c)
              a.value = "" + c;
          } else
            a.value !== "" + c && (a.value = "" + c);
        else if ("submit" === d || "reset" === d) {
          a.removeAttribute("value");
          return;
        }
        b.hasOwnProperty("value") ? cb(a, b.type, c) : b.hasOwnProperty("defaultValue") && cb(a, b.type, Sa(b.defaultValue));
        null == b.checked && null != b.defaultChecked && (a.defaultChecked = !!b.defaultChecked);
      }
      function db(a, b, c) {
        if (b.hasOwnProperty("value") || b.hasOwnProperty("defaultValue")) {
          var d = b.type;
          if (!("submit" !== d && "reset" !== d || void 0 !== b.value && null !== b.value))
            return;
          b = "" + a._wrapperState.initialValue;
          c || b === a.value || (a.value = b);
          a.defaultValue = b;
        }
        c = a.name;
        "" !== c && (a.name = "");
        a.defaultChecked = !!a._wrapperState.initialChecked;
        "" !== c && (a.name = c);
      }
      function cb(a, b, c) {
        if ("number" !== b || Xa(a.ownerDocument) !== a)
          null == c ? a.defaultValue = "" + a._wrapperState.initialValue : a.defaultValue !== "" + c && (a.defaultValue = "" + c);
      }
      var eb = Array.isArray;
      function fb(a, b, c, d) {
        a = a.options;
        if (b) {
          b = {};
          for (var e = 0; e < c.length; e++)
            b["$" + c[e]] = true;
          for (c = 0; c < a.length; c++)
            e = b.hasOwnProperty("$" + a[c].value), a[c].selected !== e && (a[c].selected = e), e && d && (a[c].defaultSelected = true);
        } else {
          c = "" + Sa(c);
          b = null;
          for (e = 0; e < a.length; e++) {
            if (a[e].value === c) {
              a[e].selected = true;
              d && (a[e].defaultSelected = true);
              return;
            }
            null !== b || a[e].disabled || (b = a[e]);
          }
          null !== b && (b.selected = true);
        }
      }
      function gb(a, b) {
        if (null != b.dangerouslySetInnerHTML)
          throw Error(p(91));
        return A({}, b, { value: void 0, defaultValue: void 0, children: "" + a._wrapperState.initialValue });
      }
      function hb(a, b) {
        var c = b.value;
        if (null == c) {
          c = b.children;
          b = b.defaultValue;
          if (null != c) {
            if (null != b)
              throw Error(p(92));
            if (eb(c)) {
              if (1 < c.length)
                throw Error(p(93));
              c = c[0];
            }
            b = c;
          }
          null == b && (b = "");
          c = b;
        }
        a._wrapperState = { initialValue: Sa(c) };
      }
      function ib(a, b) {
        var c = Sa(b.value), d = Sa(b.defaultValue);
        null != c && (c = "" + c, c !== a.value && (a.value = c), null == b.defaultValue && a.defaultValue !== c && (a.defaultValue = c));
        null != d && (a.defaultValue = "" + d);
      }
      function jb(a) {
        var b = a.textContent;
        b === a._wrapperState.initialValue && "" !== b && null !== b && (a.value = b);
      }
      function kb(a) {
        switch (a) {
          case "svg":
            return "http://www.w3.org/2000/svg";
          case "math":
            return "http://www.w3.org/1998/Math/MathML";
          default:
            return "http://www.w3.org/1999/xhtml";
        }
      }
      function lb(a, b) {
        return null == a || "http://www.w3.org/1999/xhtml" === a ? kb(b) : "http://www.w3.org/2000/svg" === a && "foreignObject" === b ? "http://www.w3.org/1999/xhtml" : a;
      }
      var mb;
      var nb = function(a) {
        return "undefined" !== typeof MSApp && MSApp.execUnsafeLocalFunction ? function(b, c, d, e) {
          MSApp.execUnsafeLocalFunction(function() {
            return a(b, c, d, e);
          });
        } : a;
      }(function(a, b) {
        if ("http://www.w3.org/2000/svg" !== a.namespaceURI || "innerHTML" in a)
          a.innerHTML = b;
        else {
          mb = mb || document.createElement("div");
          mb.innerHTML = "<svg>" + b.valueOf().toString() + "</svg>";
          for (b = mb.firstChild; a.firstChild; )
            a.removeChild(a.firstChild);
          for (; b.firstChild; )
            a.appendChild(b.firstChild);
        }
      });
      function ob(a, b) {
        if (b) {
          var c = a.firstChild;
          if (c && c === a.lastChild && 3 === c.nodeType) {
            c.nodeValue = b;
            return;
          }
        }
        a.textContent = b;
      }
      var pb = {
        animationIterationCount: true,
        aspectRatio: true,
        borderImageOutset: true,
        borderImageSlice: true,
        borderImageWidth: true,
        boxFlex: true,
        boxFlexGroup: true,
        boxOrdinalGroup: true,
        columnCount: true,
        columns: true,
        flex: true,
        flexGrow: true,
        flexPositive: true,
        flexShrink: true,
        flexNegative: true,
        flexOrder: true,
        gridArea: true,
        gridRow: true,
        gridRowEnd: true,
        gridRowSpan: true,
        gridRowStart: true,
        gridColumn: true,
        gridColumnEnd: true,
        gridColumnSpan: true,
        gridColumnStart: true,
        fontWeight: true,
        lineClamp: true,
        lineHeight: true,
        opacity: true,
        order: true,
        orphans: true,
        tabSize: true,
        widows: true,
        zIndex: true,
        zoom: true,
        fillOpacity: true,
        floodOpacity: true,
        stopOpacity: true,
        strokeDasharray: true,
        strokeDashoffset: true,
        strokeMiterlimit: true,
        strokeOpacity: true,
        strokeWidth: true
      };
      var qb = ["Webkit", "ms", "Moz", "O"];
      Object.keys(pb).forEach(function(a) {
        qb.forEach(function(b) {
          b = b + a.charAt(0).toUpperCase() + a.substring(1);
          pb[b] = pb[a];
        });
      });
      function rb(a, b, c) {
        return null == b || "boolean" === typeof b || "" === b ? "" : c || "number" !== typeof b || 0 === b || pb.hasOwnProperty(a) && pb[a] ? ("" + b).trim() : b + "px";
      }
      function sb(a, b) {
        a = a.style;
        for (var c in b)
          if (b.hasOwnProperty(c)) {
            var d = 0 === c.indexOf("--"), e = rb(c, b[c], d);
            "float" === c && (c = "cssFloat");
            d ? a.setProperty(c, e) : a[c] = e;
          }
      }
      var tb = A({ menuitem: true }, { area: true, base: true, br: true, col: true, embed: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true });
      function ub(a, b) {
        if (b) {
          if (tb[a] && (null != b.children || null != b.dangerouslySetInnerHTML))
            throw Error(p(137, a));
          if (null != b.dangerouslySetInnerHTML) {
            if (null != b.children)
              throw Error(p(60));
            if ("object" !== typeof b.dangerouslySetInnerHTML || !("__html" in b.dangerouslySetInnerHTML))
              throw Error(p(61));
          }
          if (null != b.style && "object" !== typeof b.style)
            throw Error(p(62));
        }
      }
      function vb(a, b) {
        if (-1 === a.indexOf("-"))
          return "string" === typeof b.is;
        switch (a) {
          case "annotation-xml":
          case "color-profile":
          case "font-face":
          case "font-face-src":
          case "font-face-uri":
          case "font-face-format":
          case "font-face-name":
          case "missing-glyph":
            return false;
          default:
            return true;
        }
      }
      var wb = null;
      function xb(a) {
        a = a.target || a.srcElement || window;
        a.correspondingUseElement && (a = a.correspondingUseElement);
        return 3 === a.nodeType ? a.parentNode : a;
      }
      var yb = null;
      var zb = null;
      var Ab = null;
      function Bb(a) {
        if (a = Cb(a)) {
          if ("function" !== typeof yb)
            throw Error(p(280));
          var b = a.stateNode;
          b && (b = Db(b), yb(a.stateNode, a.type, b));
        }
      }
      function Eb(a) {
        zb ? Ab ? Ab.push(a) : Ab = [a] : zb = a;
      }
      function Fb() {
        if (zb) {
          var a = zb, b = Ab;
          Ab = zb = null;
          Bb(a);
          if (b)
            for (a = 0; a < b.length; a++)
              Bb(b[a]);
        }
      }
      function Gb(a, b) {
        return a(b);
      }
      function Hb() {
      }
      var Ib = false;
      function Jb(a, b, c) {
        if (Ib)
          return a(b, c);
        Ib = true;
        try {
          return Gb(a, b, c);
        } finally {
          if (Ib = false, null !== zb || null !== Ab)
            Hb(), Fb();
        }
      }
      function Kb(a, b) {
        var c = a.stateNode;
        if (null === c)
          return null;
        var d = Db(c);
        if (null === d)
          return null;
        c = d[b];
        a:
          switch (b) {
            case "onClick":
            case "onClickCapture":
            case "onDoubleClick":
            case "onDoubleClickCapture":
            case "onMouseDown":
            case "onMouseDownCapture":
            case "onMouseMove":
            case "onMouseMoveCapture":
            case "onMouseUp":
            case "onMouseUpCapture":
            case "onMouseEnter":
              (d = !d.disabled) || (a = a.type, d = !("button" === a || "input" === a || "select" === a || "textarea" === a));
              a = !d;
              break a;
            default:
              a = false;
          }
        if (a)
          return null;
        if (c && "function" !== typeof c)
          throw Error(p(231, b, typeof c));
        return c;
      }
      var Lb = false;
      if (ia)
        try {
          Mb = {};
          Object.defineProperty(Mb, "passive", { get: function() {
            Lb = true;
          } });
          window.addEventListener("test", Mb, Mb);
          window.removeEventListener("test", Mb, Mb);
        } catch (a) {
          Lb = false;
        }
      var Mb;
      function Nb(a, b, c, d, e, f, g, h, k) {
        var l = Array.prototype.slice.call(arguments, 3);
        try {
          b.apply(c, l);
        } catch (m) {
          this.onError(m);
        }
      }
      var Ob = false;
      var Pb = null;
      var Qb = false;
      var Rb = null;
      var Sb = { onError: function(a) {
        Ob = true;
        Pb = a;
      } };
      function Tb(a, b, c, d, e, f, g, h, k) {
        Ob = false;
        Pb = null;
        Nb.apply(Sb, arguments);
      }
      function Ub(a, b, c, d, e, f, g, h, k) {
        Tb.apply(this, arguments);
        if (Ob) {
          if (Ob) {
            var l = Pb;
            Ob = false;
            Pb = null;
          } else
            throw Error(p(198));
          Qb || (Qb = true, Rb = l);
        }
      }
      function Vb(a) {
        var b = a, c = a;
        if (a.alternate)
          for (; b.return; )
            b = b.return;
        else {
          a = b;
          do
            b = a, 0 !== (b.flags & 4098) && (c = b.return), a = b.return;
          while (a);
        }
        return 3 === b.tag ? c : null;
      }
      function Wb(a) {
        if (13 === a.tag) {
          var b = a.memoizedState;
          null === b && (a = a.alternate, null !== a && (b = a.memoizedState));
          if (null !== b)
            return b.dehydrated;
        }
        return null;
      }
      function Xb(a) {
        if (Vb(a) !== a)
          throw Error(p(188));
      }
      function Yb(a) {
        var b = a.alternate;
        if (!b) {
          b = Vb(a);
          if (null === b)
            throw Error(p(188));
          return b !== a ? null : a;
        }
        for (var c = a, d = b; ; ) {
          var e = c.return;
          if (null === e)
            break;
          var f = e.alternate;
          if (null === f) {
            d = e.return;
            if (null !== d) {
              c = d;
              continue;
            }
            break;
          }
          if (e.child === f.child) {
            for (f = e.child; f; ) {
              if (f === c)
                return Xb(e), a;
              if (f === d)
                return Xb(e), b;
              f = f.sibling;
            }
            throw Error(p(188));
          }
          if (c.return !== d.return)
            c = e, d = f;
          else {
            for (var g = false, h = e.child; h; ) {
              if (h === c) {
                g = true;
                c = e;
                d = f;
                break;
              }
              if (h === d) {
                g = true;
                d = e;
                c = f;
                break;
              }
              h = h.sibling;
            }
            if (!g) {
              for (h = f.child; h; ) {
                if (h === c) {
                  g = true;
                  c = f;
                  d = e;
                  break;
                }
                if (h === d) {
                  g = true;
                  d = f;
                  c = e;
                  break;
                }
                h = h.sibling;
              }
              if (!g)
                throw Error(p(189));
            }
          }
          if (c.alternate !== d)
            throw Error(p(190));
        }
        if (3 !== c.tag)
          throw Error(p(188));
        return c.stateNode.current === c ? a : b;
      }
      function Zb(a) {
        a = Yb(a);
        return null !== a ? $b(a) : null;
      }
      function $b(a) {
        if (5 === a.tag || 6 === a.tag)
          return a;
        for (a = a.child; null !== a; ) {
          var b = $b(a);
          if (null !== b)
            return b;
          a = a.sibling;
        }
        return null;
      }
      var ac = ca.unstable_scheduleCallback;
      var bc = ca.unstable_cancelCallback;
      var cc = ca.unstable_shouldYield;
      var dc = ca.unstable_requestPaint;
      var B = ca.unstable_now;
      var ec = ca.unstable_getCurrentPriorityLevel;
      var fc = ca.unstable_ImmediatePriority;
      var gc = ca.unstable_UserBlockingPriority;
      var hc = ca.unstable_NormalPriority;
      var ic = ca.unstable_LowPriority;
      var jc = ca.unstable_IdlePriority;
      var kc = null;
      var lc = null;
      function mc(a) {
        if (lc && "function" === typeof lc.onCommitFiberRoot)
          try {
            lc.onCommitFiberRoot(kc, a, void 0, 128 === (a.current.flags & 128));
          } catch (b) {
          }
      }
      var oc = Math.clz32 ? Math.clz32 : nc;
      var pc = Math.log;
      var qc = Math.LN2;
      function nc(a) {
        a >>>= 0;
        return 0 === a ? 32 : 31 - (pc(a) / qc | 0) | 0;
      }
      var rc = 64;
      var sc = 4194304;
      function tc(a) {
        switch (a & -a) {
          case 1:
            return 1;
          case 2:
            return 2;
          case 4:
            return 4;
          case 8:
            return 8;
          case 16:
            return 16;
          case 32:
            return 32;
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return a & 4194240;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return a & 130023424;
          case 134217728:
            return 134217728;
          case 268435456:
            return 268435456;
          case 536870912:
            return 536870912;
          case 1073741824:
            return 1073741824;
          default:
            return a;
        }
      }
      function uc(a, b) {
        var c = a.pendingLanes;
        if (0 === c)
          return 0;
        var d = 0, e = a.suspendedLanes, f = a.pingedLanes, g = c & 268435455;
        if (0 !== g) {
          var h = g & ~e;
          0 !== h ? d = tc(h) : (f &= g, 0 !== f && (d = tc(f)));
        } else
          g = c & ~e, 0 !== g ? d = tc(g) : 0 !== f && (d = tc(f));
        if (0 === d)
          return 0;
        if (0 !== b && b !== d && 0 === (b & e) && (e = d & -d, f = b & -b, e >= f || 16 === e && 0 !== (f & 4194240)))
          return b;
        0 !== (d & 4) && (d |= c & 16);
        b = a.entangledLanes;
        if (0 !== b)
          for (a = a.entanglements, b &= d; 0 < b; )
            c = 31 - oc(b), e = 1 << c, d |= a[c], b &= ~e;
        return d;
      }
      function vc(a, b) {
        switch (a) {
          case 1:
          case 2:
          case 4:
            return b + 250;
          case 8:
          case 16:
          case 32:
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return b + 5e3;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return -1;
          case 134217728:
          case 268435456:
          case 536870912:
          case 1073741824:
            return -1;
          default:
            return -1;
        }
      }
      function wc(a, b) {
        for (var c = a.suspendedLanes, d = a.pingedLanes, e = a.expirationTimes, f = a.pendingLanes; 0 < f; ) {
          var g = 31 - oc(f), h = 1 << g, k = e[g];
          if (-1 === k) {
            if (0 === (h & c) || 0 !== (h & d))
              e[g] = vc(h, b);
          } else
            k <= b && (a.expiredLanes |= h);
          f &= ~h;
        }
      }
      function xc(a) {
        a = a.pendingLanes & -1073741825;
        return 0 !== a ? a : a & 1073741824 ? 1073741824 : 0;
      }
      function yc() {
        var a = rc;
        rc <<= 1;
        0 === (rc & 4194240) && (rc = 64);
        return a;
      }
      function zc(a) {
        for (var b = [], c = 0; 31 > c; c++)
          b.push(a);
        return b;
      }
      function Ac(a, b, c) {
        a.pendingLanes |= b;
        536870912 !== b && (a.suspendedLanes = 0, a.pingedLanes = 0);
        a = a.eventTimes;
        b = 31 - oc(b);
        a[b] = c;
      }
      function Bc(a, b) {
        var c = a.pendingLanes & ~b;
        a.pendingLanes = b;
        a.suspendedLanes = 0;
        a.pingedLanes = 0;
        a.expiredLanes &= b;
        a.mutableReadLanes &= b;
        a.entangledLanes &= b;
        b = a.entanglements;
        var d = a.eventTimes;
        for (a = a.expirationTimes; 0 < c; ) {
          var e = 31 - oc(c), f = 1 << e;
          b[e] = 0;
          d[e] = -1;
          a[e] = -1;
          c &= ~f;
        }
      }
      function Cc(a, b) {
        var c = a.entangledLanes |= b;
        for (a = a.entanglements; c; ) {
          var d = 31 - oc(c), e = 1 << d;
          e & b | a[d] & b && (a[d] |= b);
          c &= ~e;
        }
      }
      var C = 0;
      function Dc(a) {
        a &= -a;
        return 1 < a ? 4 < a ? 0 !== (a & 268435455) ? 16 : 536870912 : 4 : 1;
      }
      var Ec;
      var Fc;
      var Gc;
      var Hc;
      var Ic;
      var Jc = false;
      var Kc = [];
      var Lc = null;
      var Mc = null;
      var Nc = null;
      var Oc = /* @__PURE__ */ new Map();
      var Pc = /* @__PURE__ */ new Map();
      var Qc = [];
      var Rc = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
      function Sc(a, b) {
        switch (a) {
          case "focusin":
          case "focusout":
            Lc = null;
            break;
          case "dragenter":
          case "dragleave":
            Mc = null;
            break;
          case "mouseover":
          case "mouseout":
            Nc = null;
            break;
          case "pointerover":
          case "pointerout":
            Oc.delete(b.pointerId);
            break;
          case "gotpointercapture":
          case "lostpointercapture":
            Pc.delete(b.pointerId);
        }
      }
      function Tc(a, b, c, d, e, f) {
        if (null === a || a.nativeEvent !== f)
          return a = { blockedOn: b, domEventName: c, eventSystemFlags: d, nativeEvent: f, targetContainers: [e] }, null !== b && (b = Cb(b), null !== b && Fc(b)), a;
        a.eventSystemFlags |= d;
        b = a.targetContainers;
        null !== e && -1 === b.indexOf(e) && b.push(e);
        return a;
      }
      function Uc(a, b, c, d, e) {
        switch (b) {
          case "focusin":
            return Lc = Tc(Lc, a, b, c, d, e), true;
          case "dragenter":
            return Mc = Tc(Mc, a, b, c, d, e), true;
          case "mouseover":
            return Nc = Tc(Nc, a, b, c, d, e), true;
          case "pointerover":
            var f = e.pointerId;
            Oc.set(f, Tc(Oc.get(f) || null, a, b, c, d, e));
            return true;
          case "gotpointercapture":
            return f = e.pointerId, Pc.set(f, Tc(Pc.get(f) || null, a, b, c, d, e)), true;
        }
        return false;
      }
      function Vc(a) {
        var b = Wc(a.target);
        if (null !== b) {
          var c = Vb(b);
          if (null !== c) {
            if (b = c.tag, 13 === b) {
              if (b = Wb(c), null !== b) {
                a.blockedOn = b;
                Ic(a.priority, function() {
                  Gc(c);
                });
                return;
              }
            } else if (3 === b && c.stateNode.current.memoizedState.isDehydrated) {
              a.blockedOn = 3 === c.tag ? c.stateNode.containerInfo : null;
              return;
            }
          }
        }
        a.blockedOn = null;
      }
      function Xc(a) {
        if (null !== a.blockedOn)
          return false;
        for (var b = a.targetContainers; 0 < b.length; ) {
          var c = Yc(a.domEventName, a.eventSystemFlags, b[0], a.nativeEvent);
          if (null === c) {
            c = a.nativeEvent;
            var d = new c.constructor(c.type, c);
            wb = d;
            c.target.dispatchEvent(d);
            wb = null;
          } else
            return b = Cb(c), null !== b && Fc(b), a.blockedOn = c, false;
          b.shift();
        }
        return true;
      }
      function Zc(a, b, c) {
        Xc(a) && c.delete(b);
      }
      function $c() {
        Jc = false;
        null !== Lc && Xc(Lc) && (Lc = null);
        null !== Mc && Xc(Mc) && (Mc = null);
        null !== Nc && Xc(Nc) && (Nc = null);
        Oc.forEach(Zc);
        Pc.forEach(Zc);
      }
      function ad(a, b) {
        a.blockedOn === b && (a.blockedOn = null, Jc || (Jc = true, ca.unstable_scheduleCallback(ca.unstable_NormalPriority, $c)));
      }
      function bd(a) {
        function b(b2) {
          return ad(b2, a);
        }
        if (0 < Kc.length) {
          ad(Kc[0], a);
          for (var c = 1; c < Kc.length; c++) {
            var d = Kc[c];
            d.blockedOn === a && (d.blockedOn = null);
          }
        }
        null !== Lc && ad(Lc, a);
        null !== Mc && ad(Mc, a);
        null !== Nc && ad(Nc, a);
        Oc.forEach(b);
        Pc.forEach(b);
        for (c = 0; c < Qc.length; c++)
          d = Qc[c], d.blockedOn === a && (d.blockedOn = null);
        for (; 0 < Qc.length && (c = Qc[0], null === c.blockedOn); )
          Vc(c), null === c.blockedOn && Qc.shift();
      }
      var cd = ua.ReactCurrentBatchConfig;
      var dd = true;
      function ed(a, b, c, d) {
        var e = C, f = cd.transition;
        cd.transition = null;
        try {
          C = 1, fd(a, b, c, d);
        } finally {
          C = e, cd.transition = f;
        }
      }
      function gd(a, b, c, d) {
        var e = C, f = cd.transition;
        cd.transition = null;
        try {
          C = 4, fd(a, b, c, d);
        } finally {
          C = e, cd.transition = f;
        }
      }
      function fd(a, b, c, d) {
        if (dd) {
          var e = Yc(a, b, c, d);
          if (null === e)
            hd(a, b, d, id, c), Sc(a, d);
          else if (Uc(e, a, b, c, d))
            d.stopPropagation();
          else if (Sc(a, d), b & 4 && -1 < Rc.indexOf(a)) {
            for (; null !== e; ) {
              var f = Cb(e);
              null !== f && Ec(f);
              f = Yc(a, b, c, d);
              null === f && hd(a, b, d, id, c);
              if (f === e)
                break;
              e = f;
            }
            null !== e && d.stopPropagation();
          } else
            hd(a, b, d, null, c);
        }
      }
      var id = null;
      function Yc(a, b, c, d) {
        id = null;
        a = xb(d);
        a = Wc(a);
        if (null !== a)
          if (b = Vb(a), null === b)
            a = null;
          else if (c = b.tag, 13 === c) {
            a = Wb(b);
            if (null !== a)
              return a;
            a = null;
          } else if (3 === c) {
            if (b.stateNode.current.memoizedState.isDehydrated)
              return 3 === b.tag ? b.stateNode.containerInfo : null;
            a = null;
          } else
            b !== a && (a = null);
        id = a;
        return null;
      }
      function jd(a) {
        switch (a) {
          case "cancel":
          case "click":
          case "close":
          case "contextmenu":
          case "copy":
          case "cut":
          case "auxclick":
          case "dblclick":
          case "dragend":
          case "dragstart":
          case "drop":
          case "focusin":
          case "focusout":
          case "input":
          case "invalid":
          case "keydown":
          case "keypress":
          case "keyup":
          case "mousedown":
          case "mouseup":
          case "paste":
          case "pause":
          case "play":
          case "pointercancel":
          case "pointerdown":
          case "pointerup":
          case "ratechange":
          case "reset":
          case "resize":
          case "seeked":
          case "submit":
          case "touchcancel":
          case "touchend":
          case "touchstart":
          case "volumechange":
          case "change":
          case "selectionchange":
          case "textInput":
          case "compositionstart":
          case "compositionend":
          case "compositionupdate":
          case "beforeblur":
          case "afterblur":
          case "beforeinput":
          case "blur":
          case "fullscreenchange":
          case "focus":
          case "hashchange":
          case "popstate":
          case "select":
          case "selectstart":
            return 1;
          case "drag":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "mousemove":
          case "mouseout":
          case "mouseover":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "scroll":
          case "toggle":
          case "touchmove":
          case "wheel":
          case "mouseenter":
          case "mouseleave":
          case "pointerenter":
          case "pointerleave":
            return 4;
          case "message":
            switch (ec()) {
              case fc:
                return 1;
              case gc:
                return 4;
              case hc:
              case ic:
                return 16;
              case jc:
                return 536870912;
              default:
                return 16;
            }
          default:
            return 16;
        }
      }
      var kd = null;
      var ld = null;
      var md = null;
      function nd() {
        if (md)
          return md;
        var a, b = ld, c = b.length, d, e = "value" in kd ? kd.value : kd.textContent, f = e.length;
        for (a = 0; a < c && b[a] === e[a]; a++)
          ;
        var g = c - a;
        for (d = 1; d <= g && b[c - d] === e[f - d]; d++)
          ;
        return md = e.slice(a, 1 < d ? 1 - d : void 0);
      }
      function od(a) {
        var b = a.keyCode;
        "charCode" in a ? (a = a.charCode, 0 === a && 13 === b && (a = 13)) : a = b;
        10 === a && (a = 13);
        return 32 <= a || 13 === a ? a : 0;
      }
      function pd() {
        return true;
      }
      function qd() {
        return false;
      }
      function rd(a) {
        function b(b2, d, e, f, g) {
          this._reactName = b2;
          this._targetInst = e;
          this.type = d;
          this.nativeEvent = f;
          this.target = g;
          this.currentTarget = null;
          for (var c in a)
            a.hasOwnProperty(c) && (b2 = a[c], this[c] = b2 ? b2(f) : f[c]);
          this.isDefaultPrevented = (null != f.defaultPrevented ? f.defaultPrevented : false === f.returnValue) ? pd : qd;
          this.isPropagationStopped = qd;
          return this;
        }
        A(b.prototype, { preventDefault: function() {
          this.defaultPrevented = true;
          var a2 = this.nativeEvent;
          a2 && (a2.preventDefault ? a2.preventDefault() : "unknown" !== typeof a2.returnValue && (a2.returnValue = false), this.isDefaultPrevented = pd);
        }, stopPropagation: function() {
          var a2 = this.nativeEvent;
          a2 && (a2.stopPropagation ? a2.stopPropagation() : "unknown" !== typeof a2.cancelBubble && (a2.cancelBubble = true), this.isPropagationStopped = pd);
        }, persist: function() {
        }, isPersistent: pd });
        return b;
      }
      var sd = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(a) {
        return a.timeStamp || Date.now();
      }, defaultPrevented: 0, isTrusted: 0 };
      var td = rd(sd);
      var ud = A({}, sd, { view: 0, detail: 0 });
      var vd = rd(ud);
      var wd;
      var xd;
      var yd;
      var Ad = A({}, ud, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: zd, button: 0, buttons: 0, relatedTarget: function(a) {
        return void 0 === a.relatedTarget ? a.fromElement === a.srcElement ? a.toElement : a.fromElement : a.relatedTarget;
      }, movementX: function(a) {
        if ("movementX" in a)
          return a.movementX;
        a !== yd && (yd && "mousemove" === a.type ? (wd = a.screenX - yd.screenX, xd = a.screenY - yd.screenY) : xd = wd = 0, yd = a);
        return wd;
      }, movementY: function(a) {
        return "movementY" in a ? a.movementY : xd;
      } });
      var Bd = rd(Ad);
      var Cd = A({}, Ad, { dataTransfer: 0 });
      var Dd = rd(Cd);
      var Ed = A({}, ud, { relatedTarget: 0 });
      var Fd = rd(Ed);
      var Gd = A({}, sd, { animationName: 0, elapsedTime: 0, pseudoElement: 0 });
      var Hd = rd(Gd);
      var Id = A({}, sd, { clipboardData: function(a) {
        return "clipboardData" in a ? a.clipboardData : window.clipboardData;
      } });
      var Jd = rd(Id);
      var Kd = A({}, sd, { data: 0 });
      var Ld = rd(Kd);
      var Md = {
        Esc: "Escape",
        Spacebar: " ",
        Left: "ArrowLeft",
        Up: "ArrowUp",
        Right: "ArrowRight",
        Down: "ArrowDown",
        Del: "Delete",
        Win: "OS",
        Menu: "ContextMenu",
        Apps: "ContextMenu",
        Scroll: "ScrollLock",
        MozPrintableKey: "Unidentified"
      };
      var Nd = {
        8: "Backspace",
        9: "Tab",
        12: "Clear",
        13: "Enter",
        16: "Shift",
        17: "Control",
        18: "Alt",
        19: "Pause",
        20: "CapsLock",
        27: "Escape",
        32: " ",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "ArrowLeft",
        38: "ArrowUp",
        39: "ArrowRight",
        40: "ArrowDown",
        45: "Insert",
        46: "Delete",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12",
        144: "NumLock",
        145: "ScrollLock",
        224: "Meta"
      };
      var Od = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
      function Pd(a) {
        var b = this.nativeEvent;
        return b.getModifierState ? b.getModifierState(a) : (a = Od[a]) ? !!b[a] : false;
      }
      function zd() {
        return Pd;
      }
      var Qd = A({}, ud, { key: function(a) {
        if (a.key) {
          var b = Md[a.key] || a.key;
          if ("Unidentified" !== b)
            return b;
        }
        return "keypress" === a.type ? (a = od(a), 13 === a ? "Enter" : String.fromCharCode(a)) : "keydown" === a.type || "keyup" === a.type ? Nd[a.keyCode] || "Unidentified" : "";
      }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: zd, charCode: function(a) {
        return "keypress" === a.type ? od(a) : 0;
      }, keyCode: function(a) {
        return "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      }, which: function(a) {
        return "keypress" === a.type ? od(a) : "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      } });
      var Rd = rd(Qd);
      var Sd = A({}, Ad, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 });
      var Td = rd(Sd);
      var Ud = A({}, ud, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: zd });
      var Vd = rd(Ud);
      var Wd = A({}, sd, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 });
      var Xd = rd(Wd);
      var Yd = A({}, Ad, {
        deltaX: function(a) {
          return "deltaX" in a ? a.deltaX : "wheelDeltaX" in a ? -a.wheelDeltaX : 0;
        },
        deltaY: function(a) {
          return "deltaY" in a ? a.deltaY : "wheelDeltaY" in a ? -a.wheelDeltaY : "wheelDelta" in a ? -a.wheelDelta : 0;
        },
        deltaZ: 0,
        deltaMode: 0
      });
      var Zd = rd(Yd);
      var $d = [9, 13, 27, 32];
      var ae = ia && "CompositionEvent" in window;
      var be = null;
      ia && "documentMode" in document && (be = document.documentMode);
      var ce = ia && "TextEvent" in window && !be;
      var de = ia && (!ae || be && 8 < be && 11 >= be);
      var ee = String.fromCharCode(32);
      var fe = false;
      function ge(a, b) {
        switch (a) {
          case "keyup":
            return -1 !== $d.indexOf(b.keyCode);
          case "keydown":
            return 229 !== b.keyCode;
          case "keypress":
          case "mousedown":
          case "focusout":
            return true;
          default:
            return false;
        }
      }
      function he(a) {
        a = a.detail;
        return "object" === typeof a && "data" in a ? a.data : null;
      }
      var ie = false;
      function je(a, b) {
        switch (a) {
          case "compositionend":
            return he(b);
          case "keypress":
            if (32 !== b.which)
              return null;
            fe = true;
            return ee;
          case "textInput":
            return a = b.data, a === ee && fe ? null : a;
          default:
            return null;
        }
      }
      function ke(a, b) {
        if (ie)
          return "compositionend" === a || !ae && ge(a, b) ? (a = nd(), md = ld = kd = null, ie = false, a) : null;
        switch (a) {
          case "paste":
            return null;
          case "keypress":
            if (!(b.ctrlKey || b.altKey || b.metaKey) || b.ctrlKey && b.altKey) {
              if (b.char && 1 < b.char.length)
                return b.char;
              if (b.which)
                return String.fromCharCode(b.which);
            }
            return null;
          case "compositionend":
            return de && "ko" !== b.locale ? null : b.data;
          default:
            return null;
        }
      }
      var le = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
      function me(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return "input" === b ? !!le[a.type] : "textarea" === b ? true : false;
      }
      function ne(a, b, c, d) {
        Eb(d);
        b = oe(b, "onChange");
        0 < b.length && (c = new td("onChange", "change", null, c, d), a.push({ event: c, listeners: b }));
      }
      var pe = null;
      var qe = null;
      function re(a) {
        se(a, 0);
      }
      function te(a) {
        var b = ue(a);
        if (Wa(b))
          return a;
      }
      function ve(a, b) {
        if ("change" === a)
          return b;
      }
      var we = false;
      if (ia) {
        if (ia) {
          ye = "oninput" in document;
          if (!ye) {
            ze = document.createElement("div");
            ze.setAttribute("oninput", "return;");
            ye = "function" === typeof ze.oninput;
          }
          xe = ye;
        } else
          xe = false;
        we = xe && (!document.documentMode || 9 < document.documentMode);
      }
      var xe;
      var ye;
      var ze;
      function Ae() {
        pe && (pe.detachEvent("onpropertychange", Be), qe = pe = null);
      }
      function Be(a) {
        if ("value" === a.propertyName && te(qe)) {
          var b = [];
          ne(b, qe, a, xb(a));
          Jb(re, b);
        }
      }
      function Ce(a, b, c) {
        "focusin" === a ? (Ae(), pe = b, qe = c, pe.attachEvent("onpropertychange", Be)) : "focusout" === a && Ae();
      }
      function De(a) {
        if ("selectionchange" === a || "keyup" === a || "keydown" === a)
          return te(qe);
      }
      function Ee(a, b) {
        if ("click" === a)
          return te(b);
      }
      function Fe(a, b) {
        if ("input" === a || "change" === a)
          return te(b);
      }
      function Ge(a, b) {
        return a === b && (0 !== a || 1 / a === 1 / b) || a !== a && b !== b;
      }
      var He = "function" === typeof Object.is ? Object.is : Ge;
      function Ie(a, b) {
        if (He(a, b))
          return true;
        if ("object" !== typeof a || null === a || "object" !== typeof b || null === b)
          return false;
        var c = Object.keys(a), d = Object.keys(b);
        if (c.length !== d.length)
          return false;
        for (d = 0; d < c.length; d++) {
          var e = c[d];
          if (!ja.call(b, e) || !He(a[e], b[e]))
            return false;
        }
        return true;
      }
      function Je(a) {
        for (; a && a.firstChild; )
          a = a.firstChild;
        return a;
      }
      function Ke(a, b) {
        var c = Je(a);
        a = 0;
        for (var d; c; ) {
          if (3 === c.nodeType) {
            d = a + c.textContent.length;
            if (a <= b && d >= b)
              return { node: c, offset: b - a };
            a = d;
          }
          a: {
            for (; c; ) {
              if (c.nextSibling) {
                c = c.nextSibling;
                break a;
              }
              c = c.parentNode;
            }
            c = void 0;
          }
          c = Je(c);
        }
      }
      function Le(a, b) {
        return a && b ? a === b ? true : a && 3 === a.nodeType ? false : b && 3 === b.nodeType ? Le(a, b.parentNode) : "contains" in a ? a.contains(b) : a.compareDocumentPosition ? !!(a.compareDocumentPosition(b) & 16) : false : false;
      }
      function Me() {
        for (var a = window, b = Xa(); b instanceof a.HTMLIFrameElement; ) {
          try {
            var c = "string" === typeof b.contentWindow.location.href;
          } catch (d) {
            c = false;
          }
          if (c)
            a = b.contentWindow;
          else
            break;
          b = Xa(a.document);
        }
        return b;
      }
      function Ne(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return b && ("input" === b && ("text" === a.type || "search" === a.type || "tel" === a.type || "url" === a.type || "password" === a.type) || "textarea" === b || "true" === a.contentEditable);
      }
      function Oe(a) {
        var b = Me(), c = a.focusedElem, d = a.selectionRange;
        if (b !== c && c && c.ownerDocument && Le(c.ownerDocument.documentElement, c)) {
          if (null !== d && Ne(c)) {
            if (b = d.start, a = d.end, void 0 === a && (a = b), "selectionStart" in c)
              c.selectionStart = b, c.selectionEnd = Math.min(a, c.value.length);
            else if (a = (b = c.ownerDocument || document) && b.defaultView || window, a.getSelection) {
              a = a.getSelection();
              var e = c.textContent.length, f = Math.min(d.start, e);
              d = void 0 === d.end ? f : Math.min(d.end, e);
              !a.extend && f > d && (e = d, d = f, f = e);
              e = Ke(c, f);
              var g = Ke(
                c,
                d
              );
              e && g && (1 !== a.rangeCount || a.anchorNode !== e.node || a.anchorOffset !== e.offset || a.focusNode !== g.node || a.focusOffset !== g.offset) && (b = b.createRange(), b.setStart(e.node, e.offset), a.removeAllRanges(), f > d ? (a.addRange(b), a.extend(g.node, g.offset)) : (b.setEnd(g.node, g.offset), a.addRange(b)));
            }
          }
          b = [];
          for (a = c; a = a.parentNode; )
            1 === a.nodeType && b.push({ element: a, left: a.scrollLeft, top: a.scrollTop });
          "function" === typeof c.focus && c.focus();
          for (c = 0; c < b.length; c++)
            a = b[c], a.element.scrollLeft = a.left, a.element.scrollTop = a.top;
        }
      }
      var Pe = ia && "documentMode" in document && 11 >= document.documentMode;
      var Qe = null;
      var Re = null;
      var Se = null;
      var Te = false;
      function Ue(a, b, c) {
        var d = c.window === c ? c.document : 9 === c.nodeType ? c : c.ownerDocument;
        Te || null == Qe || Qe !== Xa(d) || (d = Qe, "selectionStart" in d && Ne(d) ? d = { start: d.selectionStart, end: d.selectionEnd } : (d = (d.ownerDocument && d.ownerDocument.defaultView || window).getSelection(), d = { anchorNode: d.anchorNode, anchorOffset: d.anchorOffset, focusNode: d.focusNode, focusOffset: d.focusOffset }), Se && Ie(Se, d) || (Se = d, d = oe(Re, "onSelect"), 0 < d.length && (b = new td("onSelect", "select", null, b, c), a.push({ event: b, listeners: d }), b.target = Qe)));
      }
      function Ve(a, b) {
        var c = {};
        c[a.toLowerCase()] = b.toLowerCase();
        c["Webkit" + a] = "webkit" + b;
        c["Moz" + a] = "moz" + b;
        return c;
      }
      var We = { animationend: Ve("Animation", "AnimationEnd"), animationiteration: Ve("Animation", "AnimationIteration"), animationstart: Ve("Animation", "AnimationStart"), transitionend: Ve("Transition", "TransitionEnd") };
      var Xe = {};
      var Ye = {};
      ia && (Ye = document.createElement("div").style, "AnimationEvent" in window || (delete We.animationend.animation, delete We.animationiteration.animation, delete We.animationstart.animation), "TransitionEvent" in window || delete We.transitionend.transition);
      function Ze(a) {
        if (Xe[a])
          return Xe[a];
        if (!We[a])
          return a;
        var b = We[a], c;
        for (c in b)
          if (b.hasOwnProperty(c) && c in Ye)
            return Xe[a] = b[c];
        return a;
      }
      var $e = Ze("animationend");
      var af = Ze("animationiteration");
      var bf = Ze("animationstart");
      var cf = Ze("transitionend");
      var df = /* @__PURE__ */ new Map();
      var ef = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
      function ff(a, b) {
        df.set(a, b);
        fa(b, [a]);
      }
      for (gf = 0; gf < ef.length; gf++) {
        hf = ef[gf], jf = hf.toLowerCase(), kf = hf[0].toUpperCase() + hf.slice(1);
        ff(jf, "on" + kf);
      }
      var hf;
      var jf;
      var kf;
      var gf;
      ff($e, "onAnimationEnd");
      ff(af, "onAnimationIteration");
      ff(bf, "onAnimationStart");
      ff("dblclick", "onDoubleClick");
      ff("focusin", "onFocus");
      ff("focusout", "onBlur");
      ff(cf, "onTransitionEnd");
      ha("onMouseEnter", ["mouseout", "mouseover"]);
      ha("onMouseLeave", ["mouseout", "mouseover"]);
      ha("onPointerEnter", ["pointerout", "pointerover"]);
      ha("onPointerLeave", ["pointerout", "pointerover"]);
      fa("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
      fa("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
      fa("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
      fa("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
      fa("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
      fa("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
      var lf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" ");
      var mf = new Set("cancel close invalid load scroll toggle".split(" ").concat(lf));
      function nf(a, b, c) {
        var d = a.type || "unknown-event";
        a.currentTarget = c;
        Ub(d, b, void 0, a);
        a.currentTarget = null;
      }
      function se(a, b) {
        b = 0 !== (b & 4);
        for (var c = 0; c < a.length; c++) {
          var d = a[c], e = d.event;
          d = d.listeners;
          a: {
            var f = void 0;
            if (b)
              for (var g = d.length - 1; 0 <= g; g--) {
                var h = d[g], k = h.instance, l = h.currentTarget;
                h = h.listener;
                if (k !== f && e.isPropagationStopped())
                  break a;
                nf(e, h, l);
                f = k;
              }
            else
              for (g = 0; g < d.length; g++) {
                h = d[g];
                k = h.instance;
                l = h.currentTarget;
                h = h.listener;
                if (k !== f && e.isPropagationStopped())
                  break a;
                nf(e, h, l);
                f = k;
              }
          }
        }
        if (Qb)
          throw a = Rb, Qb = false, Rb = null, a;
      }
      function D(a, b) {
        var c = b[of];
        void 0 === c && (c = b[of] = /* @__PURE__ */ new Set());
        var d = a + "__bubble";
        c.has(d) || (pf(b, a, 2, false), c.add(d));
      }
      function qf(a, b, c) {
        var d = 0;
        b && (d |= 4);
        pf(c, a, d, b);
      }
      var rf = "_reactListening" + Math.random().toString(36).slice(2);
      function sf(a) {
        if (!a[rf]) {
          a[rf] = true;
          da.forEach(function(b2) {
            "selectionchange" !== b2 && (mf.has(b2) || qf(b2, false, a), qf(b2, true, a));
          });
          var b = 9 === a.nodeType ? a : a.ownerDocument;
          null === b || b[rf] || (b[rf] = true, qf("selectionchange", false, b));
        }
      }
      function pf(a, b, c, d) {
        switch (jd(b)) {
          case 1:
            var e = ed;
            break;
          case 4:
            e = gd;
            break;
          default:
            e = fd;
        }
        c = e.bind(null, b, c, a);
        e = void 0;
        !Lb || "touchstart" !== b && "touchmove" !== b && "wheel" !== b || (e = true);
        d ? void 0 !== e ? a.addEventListener(b, c, { capture: true, passive: e }) : a.addEventListener(b, c, true) : void 0 !== e ? a.addEventListener(b, c, { passive: e }) : a.addEventListener(b, c, false);
      }
      function hd(a, b, c, d, e) {
        var f = d;
        if (0 === (b & 1) && 0 === (b & 2) && null !== d)
          a:
            for (; ; ) {
              if (null === d)
                return;
              var g = d.tag;
              if (3 === g || 4 === g) {
                var h = d.stateNode.containerInfo;
                if (h === e || 8 === h.nodeType && h.parentNode === e)
                  break;
                if (4 === g)
                  for (g = d.return; null !== g; ) {
                    var k = g.tag;
                    if (3 === k || 4 === k) {
                      if (k = g.stateNode.containerInfo, k === e || 8 === k.nodeType && k.parentNode === e)
                        return;
                    }
                    g = g.return;
                  }
                for (; null !== h; ) {
                  g = Wc(h);
                  if (null === g)
                    return;
                  k = g.tag;
                  if (5 === k || 6 === k) {
                    d = f = g;
                    continue a;
                  }
                  h = h.parentNode;
                }
              }
              d = d.return;
            }
        Jb(function() {
          var d2 = f, e2 = xb(c), g2 = [];
          a: {
            var h2 = df.get(a);
            if (void 0 !== h2) {
              var k2 = td, n = a;
              switch (a) {
                case "keypress":
                  if (0 === od(c))
                    break a;
                case "keydown":
                case "keyup":
                  k2 = Rd;
                  break;
                case "focusin":
                  n = "focus";
                  k2 = Fd;
                  break;
                case "focusout":
                  n = "blur";
                  k2 = Fd;
                  break;
                case "beforeblur":
                case "afterblur":
                  k2 = Fd;
                  break;
                case "click":
                  if (2 === c.button)
                    break a;
                case "auxclick":
                case "dblclick":
                case "mousedown":
                case "mousemove":
                case "mouseup":
                case "mouseout":
                case "mouseover":
                case "contextmenu":
                  k2 = Bd;
                  break;
                case "drag":
                case "dragend":
                case "dragenter":
                case "dragexit":
                case "dragleave":
                case "dragover":
                case "dragstart":
                case "drop":
                  k2 = Dd;
                  break;
                case "touchcancel":
                case "touchend":
                case "touchmove":
                case "touchstart":
                  k2 = Vd;
                  break;
                case $e:
                case af:
                case bf:
                  k2 = Hd;
                  break;
                case cf:
                  k2 = Xd;
                  break;
                case "scroll":
                  k2 = vd;
                  break;
                case "wheel":
                  k2 = Zd;
                  break;
                case "copy":
                case "cut":
                case "paste":
                  k2 = Jd;
                  break;
                case "gotpointercapture":
                case "lostpointercapture":
                case "pointercancel":
                case "pointerdown":
                case "pointermove":
                case "pointerout":
                case "pointerover":
                case "pointerup":
                  k2 = Td;
              }
              var t = 0 !== (b & 4), J = !t && "scroll" === a, x = t ? null !== h2 ? h2 + "Capture" : null : h2;
              t = [];
              for (var w = d2, u; null !== w; ) {
                u = w;
                var F = u.stateNode;
                5 === u.tag && null !== F && (u = F, null !== x && (F = Kb(w, x), null != F && t.push(tf(w, F, u))));
                if (J)
                  break;
                w = w.return;
              }
              0 < t.length && (h2 = new k2(h2, n, null, c, e2), g2.push({ event: h2, listeners: t }));
            }
          }
          if (0 === (b & 7)) {
            a: {
              h2 = "mouseover" === a || "pointerover" === a;
              k2 = "mouseout" === a || "pointerout" === a;
              if (h2 && c !== wb && (n = c.relatedTarget || c.fromElement) && (Wc(n) || n[uf]))
                break a;
              if (k2 || h2) {
                h2 = e2.window === e2 ? e2 : (h2 = e2.ownerDocument) ? h2.defaultView || h2.parentWindow : window;
                if (k2) {
                  if (n = c.relatedTarget || c.toElement, k2 = d2, n = n ? Wc(n) : null, null !== n && (J = Vb(n), n !== J || 5 !== n.tag && 6 !== n.tag))
                    n = null;
                } else
                  k2 = null, n = d2;
                if (k2 !== n) {
                  t = Bd;
                  F = "onMouseLeave";
                  x = "onMouseEnter";
                  w = "mouse";
                  if ("pointerout" === a || "pointerover" === a)
                    t = Td, F = "onPointerLeave", x = "onPointerEnter", w = "pointer";
                  J = null == k2 ? h2 : ue(k2);
                  u = null == n ? h2 : ue(n);
                  h2 = new t(F, w + "leave", k2, c, e2);
                  h2.target = J;
                  h2.relatedTarget = u;
                  F = null;
                  Wc(e2) === d2 && (t = new t(x, w + "enter", n, c, e2), t.target = u, t.relatedTarget = J, F = t);
                  J = F;
                  if (k2 && n)
                    b: {
                      t = k2;
                      x = n;
                      w = 0;
                      for (u = t; u; u = vf(u))
                        w++;
                      u = 0;
                      for (F = x; F; F = vf(F))
                        u++;
                      for (; 0 < w - u; )
                        t = vf(t), w--;
                      for (; 0 < u - w; )
                        x = vf(x), u--;
                      for (; w--; ) {
                        if (t === x || null !== x && t === x.alternate)
                          break b;
                        t = vf(t);
                        x = vf(x);
                      }
                      t = null;
                    }
                  else
                    t = null;
                  null !== k2 && wf(g2, h2, k2, t, false);
                  null !== n && null !== J && wf(g2, J, n, t, true);
                }
              }
            }
            a: {
              h2 = d2 ? ue(d2) : window;
              k2 = h2.nodeName && h2.nodeName.toLowerCase();
              if ("select" === k2 || "input" === k2 && "file" === h2.type)
                var na = ve;
              else if (me(h2))
                if (we)
                  na = Fe;
                else {
                  na = De;
                  var xa = Ce;
                }
              else
                (k2 = h2.nodeName) && "input" === k2.toLowerCase() && ("checkbox" === h2.type || "radio" === h2.type) && (na = Ee);
              if (na && (na = na(a, d2))) {
                ne(g2, na, c, e2);
                break a;
              }
              xa && xa(a, h2, d2);
              "focusout" === a && (xa = h2._wrapperState) && xa.controlled && "number" === h2.type && cb(h2, "number", h2.value);
            }
            xa = d2 ? ue(d2) : window;
            switch (a) {
              case "focusin":
                if (me(xa) || "true" === xa.contentEditable)
                  Qe = xa, Re = d2, Se = null;
                break;
              case "focusout":
                Se = Re = Qe = null;
                break;
              case "mousedown":
                Te = true;
                break;
              case "contextmenu":
              case "mouseup":
              case "dragend":
                Te = false;
                Ue(g2, c, e2);
                break;
              case "selectionchange":
                if (Pe)
                  break;
              case "keydown":
              case "keyup":
                Ue(g2, c, e2);
            }
            var $a;
            if (ae)
              b: {
                switch (a) {
                  case "compositionstart":
                    var ba = "onCompositionStart";
                    break b;
                  case "compositionend":
                    ba = "onCompositionEnd";
                    break b;
                  case "compositionupdate":
                    ba = "onCompositionUpdate";
                    break b;
                }
                ba = void 0;
              }
            else
              ie ? ge(a, c) && (ba = "onCompositionEnd") : "keydown" === a && 229 === c.keyCode && (ba = "onCompositionStart");
            ba && (de && "ko" !== c.locale && (ie || "onCompositionStart" !== ba ? "onCompositionEnd" === ba && ie && ($a = nd()) : (kd = e2, ld = "value" in kd ? kd.value : kd.textContent, ie = true)), xa = oe(d2, ba), 0 < xa.length && (ba = new Ld(ba, a, null, c, e2), g2.push({ event: ba, listeners: xa }), $a ? ba.data = $a : ($a = he(c), null !== $a && (ba.data = $a))));
            if ($a = ce ? je(a, c) : ke(a, c))
              d2 = oe(d2, "onBeforeInput"), 0 < d2.length && (e2 = new Ld("onBeforeInput", "beforeinput", null, c, e2), g2.push({ event: e2, listeners: d2 }), e2.data = $a);
          }
          se(g2, b);
        });
      }
      function tf(a, b, c) {
        return { instance: a, listener: b, currentTarget: c };
      }
      function oe(a, b) {
        for (var c = b + "Capture", d = []; null !== a; ) {
          var e = a, f = e.stateNode;
          5 === e.tag && null !== f && (e = f, f = Kb(a, c), null != f && d.unshift(tf(a, f, e)), f = Kb(a, b), null != f && d.push(tf(a, f, e)));
          a = a.return;
        }
        return d;
      }
      function vf(a) {
        if (null === a)
          return null;
        do
          a = a.return;
        while (a && 5 !== a.tag);
        return a ? a : null;
      }
      function wf(a, b, c, d, e) {
        for (var f = b._reactName, g = []; null !== c && c !== d; ) {
          var h = c, k = h.alternate, l = h.stateNode;
          if (null !== k && k === d)
            break;
          5 === h.tag && null !== l && (h = l, e ? (k = Kb(c, f), null != k && g.unshift(tf(c, k, h))) : e || (k = Kb(c, f), null != k && g.push(tf(c, k, h))));
          c = c.return;
        }
        0 !== g.length && a.push({ event: b, listeners: g });
      }
      var xf = /\r\n?/g;
      var yf = /\u0000|\uFFFD/g;
      function zf(a) {
        return ("string" === typeof a ? a : "" + a).replace(xf, "\n").replace(yf, "");
      }
      function Af(a, b, c) {
        b = zf(b);
        if (zf(a) !== b && c)
          throw Error(p(425));
      }
      function Bf() {
      }
      var Cf = null;
      var Df = null;
      function Ef(a, b) {
        return "textarea" === a || "noscript" === a || "string" === typeof b.children || "number" === typeof b.children || "object" === typeof b.dangerouslySetInnerHTML && null !== b.dangerouslySetInnerHTML && null != b.dangerouslySetInnerHTML.__html;
      }
      var Ff = "function" === typeof setTimeout ? setTimeout : void 0;
      var Gf = "function" === typeof clearTimeout ? clearTimeout : void 0;
      var Hf = "function" === typeof Promise ? Promise : void 0;
      var Jf = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof Hf ? function(a) {
        return Hf.resolve(null).then(a).catch(If);
      } : Ff;
      function If(a) {
        setTimeout(function() {
          throw a;
        });
      }
      function Kf(a, b) {
        var c = b, d = 0;
        do {
          var e = c.nextSibling;
          a.removeChild(c);
          if (e && 8 === e.nodeType)
            if (c = e.data, "/$" === c) {
              if (0 === d) {
                a.removeChild(e);
                bd(b);
                return;
              }
              d--;
            } else
              "$" !== c && "$?" !== c && "$!" !== c || d++;
          c = e;
        } while (c);
        bd(b);
      }
      function Lf(a) {
        for (; null != a; a = a.nextSibling) {
          var b = a.nodeType;
          if (1 === b || 3 === b)
            break;
          if (8 === b) {
            b = a.data;
            if ("$" === b || "$!" === b || "$?" === b)
              break;
            if ("/$" === b)
              return null;
          }
        }
        return a;
      }
      function Mf(a) {
        a = a.previousSibling;
        for (var b = 0; a; ) {
          if (8 === a.nodeType) {
            var c = a.data;
            if ("$" === c || "$!" === c || "$?" === c) {
              if (0 === b)
                return a;
              b--;
            } else
              "/$" === c && b++;
          }
          a = a.previousSibling;
        }
        return null;
      }
      var Nf = Math.random().toString(36).slice(2);
      var Of = "__reactFiber$" + Nf;
      var Pf = "__reactProps$" + Nf;
      var uf = "__reactContainer$" + Nf;
      var of = "__reactEvents$" + Nf;
      var Qf = "__reactListeners$" + Nf;
      var Rf = "__reactHandles$" + Nf;
      function Wc(a) {
        var b = a[Of];
        if (b)
          return b;
        for (var c = a.parentNode; c; ) {
          if (b = c[uf] || c[Of]) {
            c = b.alternate;
            if (null !== b.child || null !== c && null !== c.child)
              for (a = Mf(a); null !== a; ) {
                if (c = a[Of])
                  return c;
                a = Mf(a);
              }
            return b;
          }
          a = c;
          c = a.parentNode;
        }
        return null;
      }
      function Cb(a) {
        a = a[Of] || a[uf];
        return !a || 5 !== a.tag && 6 !== a.tag && 13 !== a.tag && 3 !== a.tag ? null : a;
      }
      function ue(a) {
        if (5 === a.tag || 6 === a.tag)
          return a.stateNode;
        throw Error(p(33));
      }
      function Db(a) {
        return a[Pf] || null;
      }
      var Sf = [];
      var Tf = -1;
      function Uf(a) {
        return { current: a };
      }
      function E(a) {
        0 > Tf || (a.current = Sf[Tf], Sf[Tf] = null, Tf--);
      }
      function G(a, b) {
        Tf++;
        Sf[Tf] = a.current;
        a.current = b;
      }
      var Vf = {};
      var H = Uf(Vf);
      var Wf = Uf(false);
      var Xf = Vf;
      function Yf(a, b) {
        var c = a.type.contextTypes;
        if (!c)
          return Vf;
        var d = a.stateNode;
        if (d && d.__reactInternalMemoizedUnmaskedChildContext === b)
          return d.__reactInternalMemoizedMaskedChildContext;
        var e = {}, f;
        for (f in c)
          e[f] = b[f];
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = b, a.__reactInternalMemoizedMaskedChildContext = e);
        return e;
      }
      function Zf(a) {
        a = a.childContextTypes;
        return null !== a && void 0 !== a;
      }
      function $f() {
        E(Wf);
        E(H);
      }
      function ag(a, b, c) {
        if (H.current !== Vf)
          throw Error(p(168));
        G(H, b);
        G(Wf, c);
      }
      function bg(a, b, c) {
        var d = a.stateNode;
        b = b.childContextTypes;
        if ("function" !== typeof d.getChildContext)
          return c;
        d = d.getChildContext();
        for (var e in d)
          if (!(e in b))
            throw Error(p(108, Ra(a) || "Unknown", e));
        return A({}, c, d);
      }
      function cg(a) {
        a = (a = a.stateNode) && a.__reactInternalMemoizedMergedChildContext || Vf;
        Xf = H.current;
        G(H, a);
        G(Wf, Wf.current);
        return true;
      }
      function dg(a, b, c) {
        var d = a.stateNode;
        if (!d)
          throw Error(p(169));
        c ? (a = bg(a, b, Xf), d.__reactInternalMemoizedMergedChildContext = a, E(Wf), E(H), G(H, a)) : E(Wf);
        G(Wf, c);
      }
      var eg = null;
      var fg = false;
      var gg = false;
      function hg(a) {
        null === eg ? eg = [a] : eg.push(a);
      }
      function ig(a) {
        fg = true;
        hg(a);
      }
      function jg() {
        if (!gg && null !== eg) {
          gg = true;
          var a = 0, b = C;
          try {
            var c = eg;
            for (C = 1; a < c.length; a++) {
              var d = c[a];
              do
                d = d(true);
              while (null !== d);
            }
            eg = null;
            fg = false;
          } catch (e) {
            throw null !== eg && (eg = eg.slice(a + 1)), ac(fc, jg), e;
          } finally {
            C = b, gg = false;
          }
        }
        return null;
      }
      var kg = [];
      var lg = 0;
      var mg = null;
      var ng = 0;
      var og = [];
      var pg = 0;
      var qg = null;
      var rg = 1;
      var sg = "";
      function tg(a, b) {
        kg[lg++] = ng;
        kg[lg++] = mg;
        mg = a;
        ng = b;
      }
      function ug(a, b, c) {
        og[pg++] = rg;
        og[pg++] = sg;
        og[pg++] = qg;
        qg = a;
        var d = rg;
        a = sg;
        var e = 32 - oc(d) - 1;
        d &= ~(1 << e);
        c += 1;
        var f = 32 - oc(b) + e;
        if (30 < f) {
          var g = e - e % 5;
          f = (d & (1 << g) - 1).toString(32);
          d >>= g;
          e -= g;
          rg = 1 << 32 - oc(b) + e | c << e | d;
          sg = f + a;
        } else
          rg = 1 << f | c << e | d, sg = a;
      }
      function vg(a) {
        null !== a.return && (tg(a, 1), ug(a, 1, 0));
      }
      function wg(a) {
        for (; a === mg; )
          mg = kg[--lg], kg[lg] = null, ng = kg[--lg], kg[lg] = null;
        for (; a === qg; )
          qg = og[--pg], og[pg] = null, sg = og[--pg], og[pg] = null, rg = og[--pg], og[pg] = null;
      }
      var xg = null;
      var yg = null;
      var I = false;
      var zg = null;
      function Ag(a, b) {
        var c = Bg(5, null, null, 0);
        c.elementType = "DELETED";
        c.stateNode = b;
        c.return = a;
        b = a.deletions;
        null === b ? (a.deletions = [c], a.flags |= 16) : b.push(c);
      }
      function Cg(a, b) {
        switch (a.tag) {
          case 5:
            var c = a.type;
            b = 1 !== b.nodeType || c.toLowerCase() !== b.nodeName.toLowerCase() ? null : b;
            return null !== b ? (a.stateNode = b, xg = a, yg = Lf(b.firstChild), true) : false;
          case 6:
            return b = "" === a.pendingProps || 3 !== b.nodeType ? null : b, null !== b ? (a.stateNode = b, xg = a, yg = null, true) : false;
          case 13:
            return b = 8 !== b.nodeType ? null : b, null !== b ? (c = null !== qg ? { id: rg, overflow: sg } : null, a.memoizedState = { dehydrated: b, treeContext: c, retryLane: 1073741824 }, c = Bg(18, null, null, 0), c.stateNode = b, c.return = a, a.child = c, xg = a, yg = null, true) : false;
          default:
            return false;
        }
      }
      function Dg(a) {
        return 0 !== (a.mode & 1) && 0 === (a.flags & 128);
      }
      function Eg(a) {
        if (I) {
          var b = yg;
          if (b) {
            var c = b;
            if (!Cg(a, b)) {
              if (Dg(a))
                throw Error(p(418));
              b = Lf(c.nextSibling);
              var d = xg;
              b && Cg(a, b) ? Ag(d, c) : (a.flags = a.flags & -4097 | 2, I = false, xg = a);
            }
          } else {
            if (Dg(a))
              throw Error(p(418));
            a.flags = a.flags & -4097 | 2;
            I = false;
            xg = a;
          }
        }
      }
      function Fg(a) {
        for (a = a.return; null !== a && 5 !== a.tag && 3 !== a.tag && 13 !== a.tag; )
          a = a.return;
        xg = a;
      }
      function Gg(a) {
        if (a !== xg)
          return false;
        if (!I)
          return Fg(a), I = true, false;
        var b;
        (b = 3 !== a.tag) && !(b = 5 !== a.tag) && (b = a.type, b = "head" !== b && "body" !== b && !Ef(a.type, a.memoizedProps));
        if (b && (b = yg)) {
          if (Dg(a))
            throw Hg(), Error(p(418));
          for (; b; )
            Ag(a, b), b = Lf(b.nextSibling);
        }
        Fg(a);
        if (13 === a.tag) {
          a = a.memoizedState;
          a = null !== a ? a.dehydrated : null;
          if (!a)
            throw Error(p(317));
          a: {
            a = a.nextSibling;
            for (b = 0; a; ) {
              if (8 === a.nodeType) {
                var c = a.data;
                if ("/$" === c) {
                  if (0 === b) {
                    yg = Lf(a.nextSibling);
                    break a;
                  }
                  b--;
                } else
                  "$" !== c && "$!" !== c && "$?" !== c || b++;
              }
              a = a.nextSibling;
            }
            yg = null;
          }
        } else
          yg = xg ? Lf(a.stateNode.nextSibling) : null;
        return true;
      }
      function Hg() {
        for (var a = yg; a; )
          a = Lf(a.nextSibling);
      }
      function Ig() {
        yg = xg = null;
        I = false;
      }
      function Jg(a) {
        null === zg ? zg = [a] : zg.push(a);
      }
      var Kg = ua.ReactCurrentBatchConfig;
      function Lg(a, b, c) {
        a = c.ref;
        if (null !== a && "function" !== typeof a && "object" !== typeof a) {
          if (c._owner) {
            c = c._owner;
            if (c) {
              if (1 !== c.tag)
                throw Error(p(309));
              var d = c.stateNode;
            }
            if (!d)
              throw Error(p(147, a));
            var e = d, f = "" + a;
            if (null !== b && null !== b.ref && "function" === typeof b.ref && b.ref._stringRef === f)
              return b.ref;
            b = function(a2) {
              var b2 = e.refs;
              null === a2 ? delete b2[f] : b2[f] = a2;
            };
            b._stringRef = f;
            return b;
          }
          if ("string" !== typeof a)
            throw Error(p(284));
          if (!c._owner)
            throw Error(p(290, a));
        }
        return a;
      }
      function Mg(a, b) {
        a = Object.prototype.toString.call(b);
        throw Error(p(31, "[object Object]" === a ? "object with keys {" + Object.keys(b).join(", ") + "}" : a));
      }
      function Ng(a) {
        var b = a._init;
        return b(a._payload);
      }
      function Og(a) {
        function b(b2, c2) {
          if (a) {
            var d2 = b2.deletions;
            null === d2 ? (b2.deletions = [c2], b2.flags |= 16) : d2.push(c2);
          }
        }
        function c(c2, d2) {
          if (!a)
            return null;
          for (; null !== d2; )
            b(c2, d2), d2 = d2.sibling;
          return null;
        }
        function d(a2, b2) {
          for (a2 = /* @__PURE__ */ new Map(); null !== b2; )
            null !== b2.key ? a2.set(b2.key, b2) : a2.set(b2.index, b2), b2 = b2.sibling;
          return a2;
        }
        function e(a2, b2) {
          a2 = Pg(a2, b2);
          a2.index = 0;
          a2.sibling = null;
          return a2;
        }
        function f(b2, c2, d2) {
          b2.index = d2;
          if (!a)
            return b2.flags |= 1048576, c2;
          d2 = b2.alternate;
          if (null !== d2)
            return d2 = d2.index, d2 < c2 ? (b2.flags |= 2, c2) : d2;
          b2.flags |= 2;
          return c2;
        }
        function g(b2) {
          a && null === b2.alternate && (b2.flags |= 2);
          return b2;
        }
        function h(a2, b2, c2, d2) {
          if (null === b2 || 6 !== b2.tag)
            return b2 = Qg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e(b2, c2);
          b2.return = a2;
          return b2;
        }
        function k(a2, b2, c2, d2) {
          var f2 = c2.type;
          if (f2 === ya)
            return m(a2, b2, c2.props.children, d2, c2.key);
          if (null !== b2 && (b2.elementType === f2 || "object" === typeof f2 && null !== f2 && f2.$$typeof === Ha && Ng(f2) === b2.type))
            return d2 = e(b2, c2.props), d2.ref = Lg(a2, b2, c2), d2.return = a2, d2;
          d2 = Rg(c2.type, c2.key, c2.props, null, a2.mode, d2);
          d2.ref = Lg(a2, b2, c2);
          d2.return = a2;
          return d2;
        }
        function l(a2, b2, c2, d2) {
          if (null === b2 || 4 !== b2.tag || b2.stateNode.containerInfo !== c2.containerInfo || b2.stateNode.implementation !== c2.implementation)
            return b2 = Sg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e(b2, c2.children || []);
          b2.return = a2;
          return b2;
        }
        function m(a2, b2, c2, d2, f2) {
          if (null === b2 || 7 !== b2.tag)
            return b2 = Tg(c2, a2.mode, d2, f2), b2.return = a2, b2;
          b2 = e(b2, c2);
          b2.return = a2;
          return b2;
        }
        function q(a2, b2, c2) {
          if ("string" === typeof b2 && "" !== b2 || "number" === typeof b2)
            return b2 = Qg("" + b2, a2.mode, c2), b2.return = a2, b2;
          if ("object" === typeof b2 && null !== b2) {
            switch (b2.$$typeof) {
              case va:
                return c2 = Rg(b2.type, b2.key, b2.props, null, a2.mode, c2), c2.ref = Lg(a2, null, b2), c2.return = a2, c2;
              case wa:
                return b2 = Sg(b2, a2.mode, c2), b2.return = a2, b2;
              case Ha:
                var d2 = b2._init;
                return q(a2, d2(b2._payload), c2);
            }
            if (eb(b2) || Ka(b2))
              return b2 = Tg(b2, a2.mode, c2, null), b2.return = a2, b2;
            Mg(a2, b2);
          }
          return null;
        }
        function r(a2, b2, c2, d2) {
          var e2 = null !== b2 ? b2.key : null;
          if ("string" === typeof c2 && "" !== c2 || "number" === typeof c2)
            return null !== e2 ? null : h(a2, b2, "" + c2, d2);
          if ("object" === typeof c2 && null !== c2) {
            switch (c2.$$typeof) {
              case va:
                return c2.key === e2 ? k(a2, b2, c2, d2) : null;
              case wa:
                return c2.key === e2 ? l(a2, b2, c2, d2) : null;
              case Ha:
                return e2 = c2._init, r(
                  a2,
                  b2,
                  e2(c2._payload),
                  d2
                );
            }
            if (eb(c2) || Ka(c2))
              return null !== e2 ? null : m(a2, b2, c2, d2, null);
            Mg(a2, c2);
          }
          return null;
        }
        function y(a2, b2, c2, d2, e2) {
          if ("string" === typeof d2 && "" !== d2 || "number" === typeof d2)
            return a2 = a2.get(c2) || null, h(b2, a2, "" + d2, e2);
          if ("object" === typeof d2 && null !== d2) {
            switch (d2.$$typeof) {
              case va:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, k(b2, a2, d2, e2);
              case wa:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, l(b2, a2, d2, e2);
              case Ha:
                var f2 = d2._init;
                return y(a2, b2, c2, f2(d2._payload), e2);
            }
            if (eb(d2) || Ka(d2))
              return a2 = a2.get(c2) || null, m(b2, a2, d2, e2, null);
            Mg(b2, d2);
          }
          return null;
        }
        function n(e2, g2, h2, k2) {
          for (var l2 = null, m2 = null, u = g2, w = g2 = 0, x = null; null !== u && w < h2.length; w++) {
            u.index > w ? (x = u, u = null) : x = u.sibling;
            var n2 = r(e2, u, h2[w], k2);
            if (null === n2) {
              null === u && (u = x);
              break;
            }
            a && u && null === n2.alternate && b(e2, u);
            g2 = f(n2, g2, w);
            null === m2 ? l2 = n2 : m2.sibling = n2;
            m2 = n2;
            u = x;
          }
          if (w === h2.length)
            return c(e2, u), I && tg(e2, w), l2;
          if (null === u) {
            for (; w < h2.length; w++)
              u = q(e2, h2[w], k2), null !== u && (g2 = f(u, g2, w), null === m2 ? l2 = u : m2.sibling = u, m2 = u);
            I && tg(e2, w);
            return l2;
          }
          for (u = d(e2, u); w < h2.length; w++)
            x = y(u, e2, w, h2[w], k2), null !== x && (a && null !== x.alternate && u.delete(null === x.key ? w : x.key), g2 = f(x, g2, w), null === m2 ? l2 = x : m2.sibling = x, m2 = x);
          a && u.forEach(function(a2) {
            return b(e2, a2);
          });
          I && tg(e2, w);
          return l2;
        }
        function t(e2, g2, h2, k2) {
          var l2 = Ka(h2);
          if ("function" !== typeof l2)
            throw Error(p(150));
          h2 = l2.call(h2);
          if (null == h2)
            throw Error(p(151));
          for (var u = l2 = null, m2 = g2, w = g2 = 0, x = null, n2 = h2.next(); null !== m2 && !n2.done; w++, n2 = h2.next()) {
            m2.index > w ? (x = m2, m2 = null) : x = m2.sibling;
            var t2 = r(e2, m2, n2.value, k2);
            if (null === t2) {
              null === m2 && (m2 = x);
              break;
            }
            a && m2 && null === t2.alternate && b(e2, m2);
            g2 = f(t2, g2, w);
            null === u ? l2 = t2 : u.sibling = t2;
            u = t2;
            m2 = x;
          }
          if (n2.done)
            return c(
              e2,
              m2
            ), I && tg(e2, w), l2;
          if (null === m2) {
            for (; !n2.done; w++, n2 = h2.next())
              n2 = q(e2, n2.value, k2), null !== n2 && (g2 = f(n2, g2, w), null === u ? l2 = n2 : u.sibling = n2, u = n2);
            I && tg(e2, w);
            return l2;
          }
          for (m2 = d(e2, m2); !n2.done; w++, n2 = h2.next())
            n2 = y(m2, e2, w, n2.value, k2), null !== n2 && (a && null !== n2.alternate && m2.delete(null === n2.key ? w : n2.key), g2 = f(n2, g2, w), null === u ? l2 = n2 : u.sibling = n2, u = n2);
          a && m2.forEach(function(a2) {
            return b(e2, a2);
          });
          I && tg(e2, w);
          return l2;
        }
        function J(a2, d2, f2, h2) {
          "object" === typeof f2 && null !== f2 && f2.type === ya && null === f2.key && (f2 = f2.props.children);
          if ("object" === typeof f2 && null !== f2) {
            switch (f2.$$typeof) {
              case va:
                a: {
                  for (var k2 = f2.key, l2 = d2; null !== l2; ) {
                    if (l2.key === k2) {
                      k2 = f2.type;
                      if (k2 === ya) {
                        if (7 === l2.tag) {
                          c(a2, l2.sibling);
                          d2 = e(l2, f2.props.children);
                          d2.return = a2;
                          a2 = d2;
                          break a;
                        }
                      } else if (l2.elementType === k2 || "object" === typeof k2 && null !== k2 && k2.$$typeof === Ha && Ng(k2) === l2.type) {
                        c(a2, l2.sibling);
                        d2 = e(l2, f2.props);
                        d2.ref = Lg(a2, l2, f2);
                        d2.return = a2;
                        a2 = d2;
                        break a;
                      }
                      c(a2, l2);
                      break;
                    } else
                      b(a2, l2);
                    l2 = l2.sibling;
                  }
                  f2.type === ya ? (d2 = Tg(f2.props.children, a2.mode, h2, f2.key), d2.return = a2, a2 = d2) : (h2 = Rg(f2.type, f2.key, f2.props, null, a2.mode, h2), h2.ref = Lg(a2, d2, f2), h2.return = a2, a2 = h2);
                }
                return g(a2);
              case wa:
                a: {
                  for (l2 = f2.key; null !== d2; ) {
                    if (d2.key === l2)
                      if (4 === d2.tag && d2.stateNode.containerInfo === f2.containerInfo && d2.stateNode.implementation === f2.implementation) {
                        c(a2, d2.sibling);
                        d2 = e(d2, f2.children || []);
                        d2.return = a2;
                        a2 = d2;
                        break a;
                      } else {
                        c(a2, d2);
                        break;
                      }
                    else
                      b(a2, d2);
                    d2 = d2.sibling;
                  }
                  d2 = Sg(f2, a2.mode, h2);
                  d2.return = a2;
                  a2 = d2;
                }
                return g(a2);
              case Ha:
                return l2 = f2._init, J(a2, d2, l2(f2._payload), h2);
            }
            if (eb(f2))
              return n(a2, d2, f2, h2);
            if (Ka(f2))
              return t(a2, d2, f2, h2);
            Mg(a2, f2);
          }
          return "string" === typeof f2 && "" !== f2 || "number" === typeof f2 ? (f2 = "" + f2, null !== d2 && 6 === d2.tag ? (c(a2, d2.sibling), d2 = e(d2, f2), d2.return = a2, a2 = d2) : (c(a2, d2), d2 = Qg(f2, a2.mode, h2), d2.return = a2, a2 = d2), g(a2)) : c(a2, d2);
        }
        return J;
      }
      var Ug = Og(true);
      var Vg = Og(false);
      var Wg = Uf(null);
      var Xg = null;
      var Yg = null;
      var Zg = null;
      function $g() {
        Zg = Yg = Xg = null;
      }
      function ah(a) {
        var b = Wg.current;
        E(Wg);
        a._currentValue = b;
      }
      function bh(a, b, c) {
        for (; null !== a; ) {
          var d = a.alternate;
          (a.childLanes & b) !== b ? (a.childLanes |= b, null !== d && (d.childLanes |= b)) : null !== d && (d.childLanes & b) !== b && (d.childLanes |= b);
          if (a === c)
            break;
          a = a.return;
        }
      }
      function ch(a, b) {
        Xg = a;
        Zg = Yg = null;
        a = a.dependencies;
        null !== a && null !== a.firstContext && (0 !== (a.lanes & b) && (dh = true), a.firstContext = null);
      }
      function eh(a) {
        var b = a._currentValue;
        if (Zg !== a)
          if (a = { context: a, memoizedValue: b, next: null }, null === Yg) {
            if (null === Xg)
              throw Error(p(308));
            Yg = a;
            Xg.dependencies = { lanes: 0, firstContext: a };
          } else
            Yg = Yg.next = a;
        return b;
      }
      var fh = null;
      function gh(a) {
        null === fh ? fh = [a] : fh.push(a);
      }
      function hh(a, b, c, d) {
        var e = b.interleaved;
        null === e ? (c.next = c, gh(b)) : (c.next = e.next, e.next = c);
        b.interleaved = c;
        return ih(a, d);
      }
      function ih(a, b) {
        a.lanes |= b;
        var c = a.alternate;
        null !== c && (c.lanes |= b);
        c = a;
        for (a = a.return; null !== a; )
          a.childLanes |= b, c = a.alternate, null !== c && (c.childLanes |= b), c = a, a = a.return;
        return 3 === c.tag ? c.stateNode : null;
      }
      var jh = false;
      function kh(a) {
        a.updateQueue = { baseState: a.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
      }
      function lh(a, b) {
        a = a.updateQueue;
        b.updateQueue === a && (b.updateQueue = { baseState: a.baseState, firstBaseUpdate: a.firstBaseUpdate, lastBaseUpdate: a.lastBaseUpdate, shared: a.shared, effects: a.effects });
      }
      function mh(a, b) {
        return { eventTime: a, lane: b, tag: 0, payload: null, callback: null, next: null };
      }
      function nh(a, b, c) {
        var d = a.updateQueue;
        if (null === d)
          return null;
        d = d.shared;
        if (0 !== (K & 2)) {
          var e = d.pending;
          null === e ? b.next = b : (b.next = e.next, e.next = b);
          d.pending = b;
          return ih(a, c);
        }
        e = d.interleaved;
        null === e ? (b.next = b, gh(d)) : (b.next = e.next, e.next = b);
        d.interleaved = b;
        return ih(a, c);
      }
      function oh(a, b, c) {
        b = b.updateQueue;
        if (null !== b && (b = b.shared, 0 !== (c & 4194240))) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      function ph(a, b) {
        var c = a.updateQueue, d = a.alternate;
        if (null !== d && (d = d.updateQueue, c === d)) {
          var e = null, f = null;
          c = c.firstBaseUpdate;
          if (null !== c) {
            do {
              var g = { eventTime: c.eventTime, lane: c.lane, tag: c.tag, payload: c.payload, callback: c.callback, next: null };
              null === f ? e = f = g : f = f.next = g;
              c = c.next;
            } while (null !== c);
            null === f ? e = f = b : f = f.next = b;
          } else
            e = f = b;
          c = { baseState: d.baseState, firstBaseUpdate: e, lastBaseUpdate: f, shared: d.shared, effects: d.effects };
          a.updateQueue = c;
          return;
        }
        a = c.lastBaseUpdate;
        null === a ? c.firstBaseUpdate = b : a.next = b;
        c.lastBaseUpdate = b;
      }
      function qh(a, b, c, d) {
        var e = a.updateQueue;
        jh = false;
        var f = e.firstBaseUpdate, g = e.lastBaseUpdate, h = e.shared.pending;
        if (null !== h) {
          e.shared.pending = null;
          var k = h, l = k.next;
          k.next = null;
          null === g ? f = l : g.next = l;
          g = k;
          var m = a.alternate;
          null !== m && (m = m.updateQueue, h = m.lastBaseUpdate, h !== g && (null === h ? m.firstBaseUpdate = l : h.next = l, m.lastBaseUpdate = k));
        }
        if (null !== f) {
          var q = e.baseState;
          g = 0;
          m = l = k = null;
          h = f;
          do {
            var r = h.lane, y = h.eventTime;
            if ((d & r) === r) {
              null !== m && (m = m.next = {
                eventTime: y,
                lane: 0,
                tag: h.tag,
                payload: h.payload,
                callback: h.callback,
                next: null
              });
              a: {
                var n = a, t = h;
                r = b;
                y = c;
                switch (t.tag) {
                  case 1:
                    n = t.payload;
                    if ("function" === typeof n) {
                      q = n.call(y, q, r);
                      break a;
                    }
                    q = n;
                    break a;
                  case 3:
                    n.flags = n.flags & -65537 | 128;
                  case 0:
                    n = t.payload;
                    r = "function" === typeof n ? n.call(y, q, r) : n;
                    if (null === r || void 0 === r)
                      break a;
                    q = A({}, q, r);
                    break a;
                  case 2:
                    jh = true;
                }
              }
              null !== h.callback && 0 !== h.lane && (a.flags |= 64, r = e.effects, null === r ? e.effects = [h] : r.push(h));
            } else
              y = { eventTime: y, lane: r, tag: h.tag, payload: h.payload, callback: h.callback, next: null }, null === m ? (l = m = y, k = q) : m = m.next = y, g |= r;
            h = h.next;
            if (null === h)
              if (h = e.shared.pending, null === h)
                break;
              else
                r = h, h = r.next, r.next = null, e.lastBaseUpdate = r, e.shared.pending = null;
          } while (1);
          null === m && (k = q);
          e.baseState = k;
          e.firstBaseUpdate = l;
          e.lastBaseUpdate = m;
          b = e.shared.interleaved;
          if (null !== b) {
            e = b;
            do
              g |= e.lane, e = e.next;
            while (e !== b);
          } else
            null === f && (e.shared.lanes = 0);
          rh |= g;
          a.lanes = g;
          a.memoizedState = q;
        }
      }
      function sh(a, b, c) {
        a = b.effects;
        b.effects = null;
        if (null !== a)
          for (b = 0; b < a.length; b++) {
            var d = a[b], e = d.callback;
            if (null !== e) {
              d.callback = null;
              d = c;
              if ("function" !== typeof e)
                throw Error(p(191, e));
              e.call(d);
            }
          }
      }
      var th = {};
      var uh = Uf(th);
      var vh = Uf(th);
      var wh = Uf(th);
      function xh(a) {
        if (a === th)
          throw Error(p(174));
        return a;
      }
      function yh(a, b) {
        G(wh, b);
        G(vh, a);
        G(uh, th);
        a = b.nodeType;
        switch (a) {
          case 9:
          case 11:
            b = (b = b.documentElement) ? b.namespaceURI : lb(null, "");
            break;
          default:
            a = 8 === a ? b.parentNode : b, b = a.namespaceURI || null, a = a.tagName, b = lb(b, a);
        }
        E(uh);
        G(uh, b);
      }
      function zh() {
        E(uh);
        E(vh);
        E(wh);
      }
      function Ah(a) {
        xh(wh.current);
        var b = xh(uh.current);
        var c = lb(b, a.type);
        b !== c && (G(vh, a), G(uh, c));
      }
      function Bh(a) {
        vh.current === a && (E(uh), E(vh));
      }
      var L = Uf(0);
      function Ch(a) {
        for (var b = a; null !== b; ) {
          if (13 === b.tag) {
            var c = b.memoizedState;
            if (null !== c && (c = c.dehydrated, null === c || "$?" === c.data || "$!" === c.data))
              return b;
          } else if (19 === b.tag && void 0 !== b.memoizedProps.revealOrder) {
            if (0 !== (b.flags & 128))
              return b;
          } else if (null !== b.child) {
            b.child.return = b;
            b = b.child;
            continue;
          }
          if (b === a)
            break;
          for (; null === b.sibling; ) {
            if (null === b.return || b.return === a)
              return null;
            b = b.return;
          }
          b.sibling.return = b.return;
          b = b.sibling;
        }
        return null;
      }
      var Dh = [];
      function Eh() {
        for (var a = 0; a < Dh.length; a++)
          Dh[a]._workInProgressVersionPrimary = null;
        Dh.length = 0;
      }
      var Fh = ua.ReactCurrentDispatcher;
      var Gh = ua.ReactCurrentBatchConfig;
      var Hh = 0;
      var M = null;
      var N = null;
      var O = null;
      var Ih = false;
      var Jh = false;
      var Kh = 0;
      var Lh = 0;
      function P() {
        throw Error(p(321));
      }
      function Mh(a, b) {
        if (null === b)
          return false;
        for (var c = 0; c < b.length && c < a.length; c++)
          if (!He(a[c], b[c]))
            return false;
        return true;
      }
      function Nh(a, b, c, d, e, f) {
        Hh = f;
        M = b;
        b.memoizedState = null;
        b.updateQueue = null;
        b.lanes = 0;
        Fh.current = null === a || null === a.memoizedState ? Oh : Ph;
        a = c(d, e);
        if (Jh) {
          f = 0;
          do {
            Jh = false;
            Kh = 0;
            if (25 <= f)
              throw Error(p(301));
            f += 1;
            O = N = null;
            b.updateQueue = null;
            Fh.current = Qh;
            a = c(d, e);
          } while (Jh);
        }
        Fh.current = Rh;
        b = null !== N && null !== N.next;
        Hh = 0;
        O = N = M = null;
        Ih = false;
        if (b)
          throw Error(p(300));
        return a;
      }
      function Sh() {
        var a = 0 !== Kh;
        Kh = 0;
        return a;
      }
      function Th() {
        var a = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
        null === O ? M.memoizedState = O = a : O = O.next = a;
        return O;
      }
      function Uh() {
        if (null === N) {
          var a = M.alternate;
          a = null !== a ? a.memoizedState : null;
        } else
          a = N.next;
        var b = null === O ? M.memoizedState : O.next;
        if (null !== b)
          O = b, N = a;
        else {
          if (null === a)
            throw Error(p(310));
          N = a;
          a = { memoizedState: N.memoizedState, baseState: N.baseState, baseQueue: N.baseQueue, queue: N.queue, next: null };
          null === O ? M.memoizedState = O = a : O = O.next = a;
        }
        return O;
      }
      function Vh(a, b) {
        return "function" === typeof b ? b(a) : b;
      }
      function Wh(a) {
        var b = Uh(), c = b.queue;
        if (null === c)
          throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = N, e = d.baseQueue, f = c.pending;
        if (null !== f) {
          if (null !== e) {
            var g = e.next;
            e.next = f.next;
            f.next = g;
          }
          d.baseQueue = e = f;
          c.pending = null;
        }
        if (null !== e) {
          f = e.next;
          d = d.baseState;
          var h = g = null, k = null, l = f;
          do {
            var m = l.lane;
            if ((Hh & m) === m)
              null !== k && (k = k.next = { lane: 0, action: l.action, hasEagerState: l.hasEagerState, eagerState: l.eagerState, next: null }), d = l.hasEagerState ? l.eagerState : a(d, l.action);
            else {
              var q = {
                lane: m,
                action: l.action,
                hasEagerState: l.hasEagerState,
                eagerState: l.eagerState,
                next: null
              };
              null === k ? (h = k = q, g = d) : k = k.next = q;
              M.lanes |= m;
              rh |= m;
            }
            l = l.next;
          } while (null !== l && l !== f);
          null === k ? g = d : k.next = h;
          He(d, b.memoizedState) || (dh = true);
          b.memoizedState = d;
          b.baseState = g;
          b.baseQueue = k;
          c.lastRenderedState = d;
        }
        a = c.interleaved;
        if (null !== a) {
          e = a;
          do
            f = e.lane, M.lanes |= f, rh |= f, e = e.next;
          while (e !== a);
        } else
          null === e && (c.lanes = 0);
        return [b.memoizedState, c.dispatch];
      }
      function Xh(a) {
        var b = Uh(), c = b.queue;
        if (null === c)
          throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = c.dispatch, e = c.pending, f = b.memoizedState;
        if (null !== e) {
          c.pending = null;
          var g = e = e.next;
          do
            f = a(f, g.action), g = g.next;
          while (g !== e);
          He(f, b.memoizedState) || (dh = true);
          b.memoizedState = f;
          null === b.baseQueue && (b.baseState = f);
          c.lastRenderedState = f;
        }
        return [f, d];
      }
      function Yh() {
      }
      function Zh(a, b) {
        var c = M, d = Uh(), e = b(), f = !He(d.memoizedState, e);
        f && (d.memoizedState = e, dh = true);
        d = d.queue;
        $h(ai.bind(null, c, d, a), [a]);
        if (d.getSnapshot !== b || f || null !== O && O.memoizedState.tag & 1) {
          c.flags |= 2048;
          bi(9, ci.bind(null, c, d, e, b), void 0, null);
          if (null === Q)
            throw Error(p(349));
          0 !== (Hh & 30) || di(c, b, e);
        }
        return e;
      }
      function di(a, b, c) {
        a.flags |= 16384;
        a = { getSnapshot: b, value: c };
        b = M.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M.updateQueue = b, b.stores = [a]) : (c = b.stores, null === c ? b.stores = [a] : c.push(a));
      }
      function ci(a, b, c, d) {
        b.value = c;
        b.getSnapshot = d;
        ei(b) && fi(a);
      }
      function ai(a, b, c) {
        return c(function() {
          ei(b) && fi(a);
        });
      }
      function ei(a) {
        var b = a.getSnapshot;
        a = a.value;
        try {
          var c = b();
          return !He(a, c);
        } catch (d) {
          return true;
        }
      }
      function fi(a) {
        var b = ih(a, 1);
        null !== b && gi(b, a, 1, -1);
      }
      function hi(a) {
        var b = Th();
        "function" === typeof a && (a = a());
        b.memoizedState = b.baseState = a;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Vh, lastRenderedState: a };
        b.queue = a;
        a = a.dispatch = ii.bind(null, M, a);
        return [b.memoizedState, a];
      }
      function bi(a, b, c, d) {
        a = { tag: a, create: b, destroy: c, deps: d, next: null };
        b = M.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M.updateQueue = b, b.lastEffect = a.next = a) : (c = b.lastEffect, null === c ? b.lastEffect = a.next = a : (d = c.next, c.next = a, a.next = d, b.lastEffect = a));
        return a;
      }
      function ji() {
        return Uh().memoizedState;
      }
      function ki(a, b, c, d) {
        var e = Th();
        M.flags |= a;
        e.memoizedState = bi(1 | b, c, void 0, void 0 === d ? null : d);
      }
      function li(a, b, c, d) {
        var e = Uh();
        d = void 0 === d ? null : d;
        var f = void 0;
        if (null !== N) {
          var g = N.memoizedState;
          f = g.destroy;
          if (null !== d && Mh(d, g.deps)) {
            e.memoizedState = bi(b, c, f, d);
            return;
          }
        }
        M.flags |= a;
        e.memoizedState = bi(1 | b, c, f, d);
      }
      function mi(a, b) {
        return ki(8390656, 8, a, b);
      }
      function $h(a, b) {
        return li(2048, 8, a, b);
      }
      function ni(a, b) {
        return li(4, 2, a, b);
      }
      function oi(a, b) {
        return li(4, 4, a, b);
      }
      function pi(a, b) {
        if ("function" === typeof b)
          return a = a(), b(a), function() {
            b(null);
          };
        if (null !== b && void 0 !== b)
          return a = a(), b.current = a, function() {
            b.current = null;
          };
      }
      function qi(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return li(4, 4, pi.bind(null, b, a), c);
      }
      function ri() {
      }
      function si(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1]))
          return d[0];
        c.memoizedState = [a, b];
        return a;
      }
      function ti(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1]))
          return d[0];
        a = a();
        c.memoizedState = [a, b];
        return a;
      }
      function ui(a, b, c) {
        if (0 === (Hh & 21))
          return a.baseState && (a.baseState = false, dh = true), a.memoizedState = c;
        He(c, b) || (c = yc(), M.lanes |= c, rh |= c, a.baseState = true);
        return b;
      }
      function vi(a, b) {
        var c = C;
        C = 0 !== c && 4 > c ? c : 4;
        a(true);
        var d = Gh.transition;
        Gh.transition = {};
        try {
          a(false), b();
        } finally {
          C = c, Gh.transition = d;
        }
      }
      function wi() {
        return Uh().memoizedState;
      }
      function xi(a, b, c) {
        var d = yi(a);
        c = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a))
          Ai(b, c);
        else if (c = hh(a, b, c, d), null !== c) {
          var e = R();
          gi(c, a, d, e);
          Bi(c, b, d);
        }
      }
      function ii(a, b, c) {
        var d = yi(a), e = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a))
          Ai(b, e);
        else {
          var f = a.alternate;
          if (0 === a.lanes && (null === f || 0 === f.lanes) && (f = b.lastRenderedReducer, null !== f))
            try {
              var g = b.lastRenderedState, h = f(g, c);
              e.hasEagerState = true;
              e.eagerState = h;
              if (He(h, g)) {
                var k = b.interleaved;
                null === k ? (e.next = e, gh(b)) : (e.next = k.next, k.next = e);
                b.interleaved = e;
                return;
              }
            } catch (l) {
            } finally {
            }
          c = hh(a, b, e, d);
          null !== c && (e = R(), gi(c, a, d, e), Bi(c, b, d));
        }
      }
      function zi(a) {
        var b = a.alternate;
        return a === M || null !== b && b === M;
      }
      function Ai(a, b) {
        Jh = Ih = true;
        var c = a.pending;
        null === c ? b.next = b : (b.next = c.next, c.next = b);
        a.pending = b;
      }
      function Bi(a, b, c) {
        if (0 !== (c & 4194240)) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      var Rh = { readContext: eh, useCallback: P, useContext: P, useEffect: P, useImperativeHandle: P, useInsertionEffect: P, useLayoutEffect: P, useMemo: P, useReducer: P, useRef: P, useState: P, useDebugValue: P, useDeferredValue: P, useTransition: P, useMutableSource: P, useSyncExternalStore: P, useId: P, unstable_isNewReconciler: false };
      var Oh = { readContext: eh, useCallback: function(a, b) {
        Th().memoizedState = [a, void 0 === b ? null : b];
        return a;
      }, useContext: eh, useEffect: mi, useImperativeHandle: function(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return ki(
          4194308,
          4,
          pi.bind(null, b, a),
          c
        );
      }, useLayoutEffect: function(a, b) {
        return ki(4194308, 4, a, b);
      }, useInsertionEffect: function(a, b) {
        return ki(4, 2, a, b);
      }, useMemo: function(a, b) {
        var c = Th();
        b = void 0 === b ? null : b;
        a = a();
        c.memoizedState = [a, b];
        return a;
      }, useReducer: function(a, b, c) {
        var d = Th();
        b = void 0 !== c ? c(b) : b;
        d.memoizedState = d.baseState = b;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: a, lastRenderedState: b };
        d.queue = a;
        a = a.dispatch = xi.bind(null, M, a);
        return [d.memoizedState, a];
      }, useRef: function(a) {
        var b = Th();
        a = { current: a };
        return b.memoizedState = a;
      }, useState: hi, useDebugValue: ri, useDeferredValue: function(a) {
        return Th().memoizedState = a;
      }, useTransition: function() {
        var a = hi(false), b = a[0];
        a = vi.bind(null, a[1]);
        Th().memoizedState = a;
        return [b, a];
      }, useMutableSource: function() {
      }, useSyncExternalStore: function(a, b, c) {
        var d = M, e = Th();
        if (I) {
          if (void 0 === c)
            throw Error(p(407));
          c = c();
        } else {
          c = b();
          if (null === Q)
            throw Error(p(349));
          0 !== (Hh & 30) || di(d, b, c);
        }
        e.memoizedState = c;
        var f = { value: c, getSnapshot: b };
        e.queue = f;
        mi(ai.bind(
          null,
          d,
          f,
          a
        ), [a]);
        d.flags |= 2048;
        bi(9, ci.bind(null, d, f, c, b), void 0, null);
        return c;
      }, useId: function() {
        var a = Th(), b = Q.identifierPrefix;
        if (I) {
          var c = sg;
          var d = rg;
          c = (d & ~(1 << 32 - oc(d) - 1)).toString(32) + c;
          b = ":" + b + "R" + c;
          c = Kh++;
          0 < c && (b += "H" + c.toString(32));
          b += ":";
        } else
          c = Lh++, b = ":" + b + "r" + c.toString(32) + ":";
        return a.memoizedState = b;
      }, unstable_isNewReconciler: false };
      var Ph = {
        readContext: eh,
        useCallback: si,
        useContext: eh,
        useEffect: $h,
        useImperativeHandle: qi,
        useInsertionEffect: ni,
        useLayoutEffect: oi,
        useMemo: ti,
        useReducer: Wh,
        useRef: ji,
        useState: function() {
          return Wh(Vh);
        },
        useDebugValue: ri,
        useDeferredValue: function(a) {
          var b = Uh();
          return ui(b, N.memoizedState, a);
        },
        useTransition: function() {
          var a = Wh(Vh)[0], b = Uh().memoizedState;
          return [a, b];
        },
        useMutableSource: Yh,
        useSyncExternalStore: Zh,
        useId: wi,
        unstable_isNewReconciler: false
      };
      var Qh = { readContext: eh, useCallback: si, useContext: eh, useEffect: $h, useImperativeHandle: qi, useInsertionEffect: ni, useLayoutEffect: oi, useMemo: ti, useReducer: Xh, useRef: ji, useState: function() {
        return Xh(Vh);
      }, useDebugValue: ri, useDeferredValue: function(a) {
        var b = Uh();
        return null === N ? b.memoizedState = a : ui(b, N.memoizedState, a);
      }, useTransition: function() {
        var a = Xh(Vh)[0], b = Uh().memoizedState;
        return [a, b];
      }, useMutableSource: Yh, useSyncExternalStore: Zh, useId: wi, unstable_isNewReconciler: false };
      function Ci(a, b) {
        if (a && a.defaultProps) {
          b = A({}, b);
          a = a.defaultProps;
          for (var c in a)
            void 0 === b[c] && (b[c] = a[c]);
          return b;
        }
        return b;
      }
      function Di(a, b, c, d) {
        b = a.memoizedState;
        c = c(d, b);
        c = null === c || void 0 === c ? b : A({}, b, c);
        a.memoizedState = c;
        0 === a.lanes && (a.updateQueue.baseState = c);
      }
      var Ei = { isMounted: function(a) {
        return (a = a._reactInternals) ? Vb(a) === a : false;
      }, enqueueSetState: function(a, b, c) {
        a = a._reactInternals;
        var d = R(), e = yi(a), f = mh(d, e);
        f.payload = b;
        void 0 !== c && null !== c && (f.callback = c);
        b = nh(a, f, e);
        null !== b && (gi(b, a, e, d), oh(b, a, e));
      }, enqueueReplaceState: function(a, b, c) {
        a = a._reactInternals;
        var d = R(), e = yi(a), f = mh(d, e);
        f.tag = 1;
        f.payload = b;
        void 0 !== c && null !== c && (f.callback = c);
        b = nh(a, f, e);
        null !== b && (gi(b, a, e, d), oh(b, a, e));
      }, enqueueForceUpdate: function(a, b) {
        a = a._reactInternals;
        var c = R(), d = yi(a), e = mh(c, d);
        e.tag = 2;
        void 0 !== b && null !== b && (e.callback = b);
        b = nh(a, e, d);
        null !== b && (gi(b, a, d, c), oh(b, a, d));
      } };
      function Fi(a, b, c, d, e, f, g) {
        a = a.stateNode;
        return "function" === typeof a.shouldComponentUpdate ? a.shouldComponentUpdate(d, f, g) : b.prototype && b.prototype.isPureReactComponent ? !Ie(c, d) || !Ie(e, f) : true;
      }
      function Gi(a, b, c) {
        var d = false, e = Vf;
        var f = b.contextType;
        "object" === typeof f && null !== f ? f = eh(f) : (e = Zf(b) ? Xf : H.current, d = b.contextTypes, f = (d = null !== d && void 0 !== d) ? Yf(a, e) : Vf);
        b = new b(c, f);
        a.memoizedState = null !== b.state && void 0 !== b.state ? b.state : null;
        b.updater = Ei;
        a.stateNode = b;
        b._reactInternals = a;
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = e, a.__reactInternalMemoizedMaskedChildContext = f);
        return b;
      }
      function Hi(a, b, c, d) {
        a = b.state;
        "function" === typeof b.componentWillReceiveProps && b.componentWillReceiveProps(c, d);
        "function" === typeof b.UNSAFE_componentWillReceiveProps && b.UNSAFE_componentWillReceiveProps(c, d);
        b.state !== a && Ei.enqueueReplaceState(b, b.state, null);
      }
      function Ii(a, b, c, d) {
        var e = a.stateNode;
        e.props = c;
        e.state = a.memoizedState;
        e.refs = {};
        kh(a);
        var f = b.contextType;
        "object" === typeof f && null !== f ? e.context = eh(f) : (f = Zf(b) ? Xf : H.current, e.context = Yf(a, f));
        e.state = a.memoizedState;
        f = b.getDerivedStateFromProps;
        "function" === typeof f && (Di(a, b, f, c), e.state = a.memoizedState);
        "function" === typeof b.getDerivedStateFromProps || "function" === typeof e.getSnapshotBeforeUpdate || "function" !== typeof e.UNSAFE_componentWillMount && "function" !== typeof e.componentWillMount || (b = e.state, "function" === typeof e.componentWillMount && e.componentWillMount(), "function" === typeof e.UNSAFE_componentWillMount && e.UNSAFE_componentWillMount(), b !== e.state && Ei.enqueueReplaceState(e, e.state, null), qh(a, c, e, d), e.state = a.memoizedState);
        "function" === typeof e.componentDidMount && (a.flags |= 4194308);
      }
      function Ji(a, b) {
        try {
          var c = "", d = b;
          do
            c += Pa(d), d = d.return;
          while (d);
          var e = c;
        } catch (f) {
          e = "\nError generating stack: " + f.message + "\n" + f.stack;
        }
        return { value: a, source: b, stack: e, digest: null };
      }
      function Ki(a, b, c) {
        return { value: a, source: null, stack: null != c ? c : null, digest: null != b ? b : null };
      }
      function Li(a, b) {
        try {
          console.error(b.value);
        } catch (c) {
          setTimeout(function() {
            throw c;
          });
        }
      }
      var Mi = "function" === typeof WeakMap ? WeakMap : Map;
      function Ni(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        c.payload = { element: null };
        var d = b.value;
        c.callback = function() {
          Oi || (Oi = true, Pi = d);
          Li(a, b);
        };
        return c;
      }
      function Qi(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        var d = a.type.getDerivedStateFromError;
        if ("function" === typeof d) {
          var e = b.value;
          c.payload = function() {
            return d(e);
          };
          c.callback = function() {
            Li(a, b);
          };
        }
        var f = a.stateNode;
        null !== f && "function" === typeof f.componentDidCatch && (c.callback = function() {
          Li(a, b);
          "function" !== typeof d && (null === Ri ? Ri = /* @__PURE__ */ new Set([this]) : Ri.add(this));
          var c2 = b.stack;
          this.componentDidCatch(b.value, { componentStack: null !== c2 ? c2 : "" });
        });
        return c;
      }
      function Si(a, b, c) {
        var d = a.pingCache;
        if (null === d) {
          d = a.pingCache = new Mi();
          var e = /* @__PURE__ */ new Set();
          d.set(b, e);
        } else
          e = d.get(b), void 0 === e && (e = /* @__PURE__ */ new Set(), d.set(b, e));
        e.has(c) || (e.add(c), a = Ti.bind(null, a, b, c), b.then(a, a));
      }
      function Ui(a) {
        do {
          var b;
          if (b = 13 === a.tag)
            b = a.memoizedState, b = null !== b ? null !== b.dehydrated ? true : false : true;
          if (b)
            return a;
          a = a.return;
        } while (null !== a);
        return null;
      }
      function Vi(a, b, c, d, e) {
        if (0 === (a.mode & 1))
          return a === b ? a.flags |= 65536 : (a.flags |= 128, c.flags |= 131072, c.flags &= -52805, 1 === c.tag && (null === c.alternate ? c.tag = 17 : (b = mh(-1, 1), b.tag = 2, nh(c, b, 1))), c.lanes |= 1), a;
        a.flags |= 65536;
        a.lanes = e;
        return a;
      }
      var Wi = ua.ReactCurrentOwner;
      var dh = false;
      function Xi(a, b, c, d) {
        b.child = null === a ? Vg(b, null, c, d) : Ug(b, a.child, c, d);
      }
      function Yi(a, b, c, d, e) {
        c = c.render;
        var f = b.ref;
        ch(b, e);
        d = Nh(a, b, c, d, f, e);
        c = Sh();
        if (null !== a && !dh)
          return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
        I && c && vg(b);
        b.flags |= 1;
        Xi(a, b, d, e);
        return b.child;
      }
      function $i(a, b, c, d, e) {
        if (null === a) {
          var f = c.type;
          if ("function" === typeof f && !aj(f) && void 0 === f.defaultProps && null === c.compare && void 0 === c.defaultProps)
            return b.tag = 15, b.type = f, bj(a, b, f, d, e);
          a = Rg(c.type, null, d, b, b.mode, e);
          a.ref = b.ref;
          a.return = b;
          return b.child = a;
        }
        f = a.child;
        if (0 === (a.lanes & e)) {
          var g = f.memoizedProps;
          c = c.compare;
          c = null !== c ? c : Ie;
          if (c(g, d) && a.ref === b.ref)
            return Zi(a, b, e);
        }
        b.flags |= 1;
        a = Pg(f, d);
        a.ref = b.ref;
        a.return = b;
        return b.child = a;
      }
      function bj(a, b, c, d, e) {
        if (null !== a) {
          var f = a.memoizedProps;
          if (Ie(f, d) && a.ref === b.ref)
            if (dh = false, b.pendingProps = d = f, 0 !== (a.lanes & e))
              0 !== (a.flags & 131072) && (dh = true);
            else
              return b.lanes = a.lanes, Zi(a, b, e);
        }
        return cj(a, b, c, d, e);
      }
      function dj(a, b, c) {
        var d = b.pendingProps, e = d.children, f = null !== a ? a.memoizedState : null;
        if ("hidden" === d.mode)
          if (0 === (b.mode & 1))
            b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, G(ej, fj), fj |= c;
          else {
            if (0 === (c & 1073741824))
              return a = null !== f ? f.baseLanes | c : c, b.lanes = b.childLanes = 1073741824, b.memoizedState = { baseLanes: a, cachePool: null, transitions: null }, b.updateQueue = null, G(ej, fj), fj |= a, null;
            b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null };
            d = null !== f ? f.baseLanes : c;
            G(ej, fj);
            fj |= d;
          }
        else
          null !== f ? (d = f.baseLanes | c, b.memoizedState = null) : d = c, G(ej, fj), fj |= d;
        Xi(a, b, e, c);
        return b.child;
      }
      function gj(a, b) {
        var c = b.ref;
        if (null === a && null !== c || null !== a && a.ref !== c)
          b.flags |= 512, b.flags |= 2097152;
      }
      function cj(a, b, c, d, e) {
        var f = Zf(c) ? Xf : H.current;
        f = Yf(b, f);
        ch(b, e);
        c = Nh(a, b, c, d, f, e);
        d = Sh();
        if (null !== a && !dh)
          return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
        I && d && vg(b);
        b.flags |= 1;
        Xi(a, b, c, e);
        return b.child;
      }
      function hj(a, b, c, d, e) {
        if (Zf(c)) {
          var f = true;
          cg(b);
        } else
          f = false;
        ch(b, e);
        if (null === b.stateNode)
          ij(a, b), Gi(b, c, d), Ii(b, c, d, e), d = true;
        else if (null === a) {
          var g = b.stateNode, h = b.memoizedProps;
          g.props = h;
          var k = g.context, l = c.contextType;
          "object" === typeof l && null !== l ? l = eh(l) : (l = Zf(c) ? Xf : H.current, l = Yf(b, l));
          var m = c.getDerivedStateFromProps, q = "function" === typeof m || "function" === typeof g.getSnapshotBeforeUpdate;
          q || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== d || k !== l) && Hi(b, g, d, l);
          jh = false;
          var r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e);
          k = b.memoizedState;
          h !== d || r !== k || Wf.current || jh ? ("function" === typeof m && (Di(b, c, m, d), k = b.memoizedState), (h = jh || Fi(b, c, h, d, r, k, l)) ? (q || "function" !== typeof g.UNSAFE_componentWillMount && "function" !== typeof g.componentWillMount || ("function" === typeof g.componentWillMount && g.componentWillMount(), "function" === typeof g.UNSAFE_componentWillMount && g.UNSAFE_componentWillMount()), "function" === typeof g.componentDidMount && (b.flags |= 4194308)) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), b.memoizedProps = d, b.memoizedState = k), g.props = d, g.state = k, g.context = l, d = h) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), d = false);
        } else {
          g = b.stateNode;
          lh(a, b);
          h = b.memoizedProps;
          l = b.type === b.elementType ? h : Ci(b.type, h);
          g.props = l;
          q = b.pendingProps;
          r = g.context;
          k = c.contextType;
          "object" === typeof k && null !== k ? k = eh(k) : (k = Zf(c) ? Xf : H.current, k = Yf(b, k));
          var y = c.getDerivedStateFromProps;
          (m = "function" === typeof y || "function" === typeof g.getSnapshotBeforeUpdate) || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== q || r !== k) && Hi(b, g, d, k);
          jh = false;
          r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e);
          var n = b.memoizedState;
          h !== q || r !== n || Wf.current || jh ? ("function" === typeof y && (Di(b, c, y, d), n = b.memoizedState), (l = jh || Fi(b, c, l, d, r, n, k) || false) ? (m || "function" !== typeof g.UNSAFE_componentWillUpdate && "function" !== typeof g.componentWillUpdate || ("function" === typeof g.componentWillUpdate && g.componentWillUpdate(d, n, k), "function" === typeof g.UNSAFE_componentWillUpdate && g.UNSAFE_componentWillUpdate(d, n, k)), "function" === typeof g.componentDidUpdate && (b.flags |= 4), "function" === typeof g.getSnapshotBeforeUpdate && (b.flags |= 1024)) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), b.memoizedProps = d, b.memoizedState = n), g.props = d, g.state = n, g.context = k, d = l) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), d = false);
        }
        return jj(a, b, c, d, f, e);
      }
      function jj(a, b, c, d, e, f) {
        gj(a, b);
        var g = 0 !== (b.flags & 128);
        if (!d && !g)
          return e && dg(b, c, false), Zi(a, b, f);
        d = b.stateNode;
        Wi.current = b;
        var h = g && "function" !== typeof c.getDerivedStateFromError ? null : d.render();
        b.flags |= 1;
        null !== a && g ? (b.child = Ug(b, a.child, null, f), b.child = Ug(b, null, h, f)) : Xi(a, b, h, f);
        b.memoizedState = d.state;
        e && dg(b, c, true);
        return b.child;
      }
      function kj(a) {
        var b = a.stateNode;
        b.pendingContext ? ag(a, b.pendingContext, b.pendingContext !== b.context) : b.context && ag(a, b.context, false);
        yh(a, b.containerInfo);
      }
      function lj(a, b, c, d, e) {
        Ig();
        Jg(e);
        b.flags |= 256;
        Xi(a, b, c, d);
        return b.child;
      }
      var mj = { dehydrated: null, treeContext: null, retryLane: 0 };
      function nj(a) {
        return { baseLanes: a, cachePool: null, transitions: null };
      }
      function oj(a, b, c) {
        var d = b.pendingProps, e = L.current, f = false, g = 0 !== (b.flags & 128), h;
        (h = g) || (h = null !== a && null === a.memoizedState ? false : 0 !== (e & 2));
        if (h)
          f = true, b.flags &= -129;
        else if (null === a || null !== a.memoizedState)
          e |= 1;
        G(L, e & 1);
        if (null === a) {
          Eg(b);
          a = b.memoizedState;
          if (null !== a && (a = a.dehydrated, null !== a))
            return 0 === (b.mode & 1) ? b.lanes = 1 : "$!" === a.data ? b.lanes = 8 : b.lanes = 1073741824, null;
          g = d.children;
          a = d.fallback;
          return f ? (d = b.mode, f = b.child, g = { mode: "hidden", children: g }, 0 === (d & 1) && null !== f ? (f.childLanes = 0, f.pendingProps = g) : f = pj(g, d, 0, null), a = Tg(a, d, c, null), f.return = b, a.return = b, f.sibling = a, b.child = f, b.child.memoizedState = nj(c), b.memoizedState = mj, a) : qj(b, g);
        }
        e = a.memoizedState;
        if (null !== e && (h = e.dehydrated, null !== h))
          return rj(a, b, g, d, h, e, c);
        if (f) {
          f = d.fallback;
          g = b.mode;
          e = a.child;
          h = e.sibling;
          var k = { mode: "hidden", children: d.children };
          0 === (g & 1) && b.child !== e ? (d = b.child, d.childLanes = 0, d.pendingProps = k, b.deletions = null) : (d = Pg(e, k), d.subtreeFlags = e.subtreeFlags & 14680064);
          null !== h ? f = Pg(h, f) : (f = Tg(f, g, c, null), f.flags |= 2);
          f.return = b;
          d.return = b;
          d.sibling = f;
          b.child = d;
          d = f;
          f = b.child;
          g = a.child.memoizedState;
          g = null === g ? nj(c) : { baseLanes: g.baseLanes | c, cachePool: null, transitions: g.transitions };
          f.memoizedState = g;
          f.childLanes = a.childLanes & ~c;
          b.memoizedState = mj;
          return d;
        }
        f = a.child;
        a = f.sibling;
        d = Pg(f, { mode: "visible", children: d.children });
        0 === (b.mode & 1) && (d.lanes = c);
        d.return = b;
        d.sibling = null;
        null !== a && (c = b.deletions, null === c ? (b.deletions = [a], b.flags |= 16) : c.push(a));
        b.child = d;
        b.memoizedState = null;
        return d;
      }
      function qj(a, b) {
        b = pj({ mode: "visible", children: b }, a.mode, 0, null);
        b.return = a;
        return a.child = b;
      }
      function sj(a, b, c, d) {
        null !== d && Jg(d);
        Ug(b, a.child, null, c);
        a = qj(b, b.pendingProps.children);
        a.flags |= 2;
        b.memoizedState = null;
        return a;
      }
      function rj(a, b, c, d, e, f, g) {
        if (c) {
          if (b.flags & 256)
            return b.flags &= -257, d = Ki(Error(p(422))), sj(a, b, g, d);
          if (null !== b.memoizedState)
            return b.child = a.child, b.flags |= 128, null;
          f = d.fallback;
          e = b.mode;
          d = pj({ mode: "visible", children: d.children }, e, 0, null);
          f = Tg(f, e, g, null);
          f.flags |= 2;
          d.return = b;
          f.return = b;
          d.sibling = f;
          b.child = d;
          0 !== (b.mode & 1) && Ug(b, a.child, null, g);
          b.child.memoizedState = nj(g);
          b.memoizedState = mj;
          return f;
        }
        if (0 === (b.mode & 1))
          return sj(a, b, g, null);
        if ("$!" === e.data) {
          d = e.nextSibling && e.nextSibling.dataset;
          if (d)
            var h = d.dgst;
          d = h;
          f = Error(p(419));
          d = Ki(f, d, void 0);
          return sj(a, b, g, d);
        }
        h = 0 !== (g & a.childLanes);
        if (dh || h) {
          d = Q;
          if (null !== d) {
            switch (g & -g) {
              case 4:
                e = 2;
                break;
              case 16:
                e = 8;
                break;
              case 64:
              case 128:
              case 256:
              case 512:
              case 1024:
              case 2048:
              case 4096:
              case 8192:
              case 16384:
              case 32768:
              case 65536:
              case 131072:
              case 262144:
              case 524288:
              case 1048576:
              case 2097152:
              case 4194304:
              case 8388608:
              case 16777216:
              case 33554432:
              case 67108864:
                e = 32;
                break;
              case 536870912:
                e = 268435456;
                break;
              default:
                e = 0;
            }
            e = 0 !== (e & (d.suspendedLanes | g)) ? 0 : e;
            0 !== e && e !== f.retryLane && (f.retryLane = e, ih(a, e), gi(d, a, e, -1));
          }
          tj();
          d = Ki(Error(p(421)));
          return sj(a, b, g, d);
        }
        if ("$?" === e.data)
          return b.flags |= 128, b.child = a.child, b = uj.bind(null, a), e._reactRetry = b, null;
        a = f.treeContext;
        yg = Lf(e.nextSibling);
        xg = b;
        I = true;
        zg = null;
        null !== a && (og[pg++] = rg, og[pg++] = sg, og[pg++] = qg, rg = a.id, sg = a.overflow, qg = b);
        b = qj(b, d.children);
        b.flags |= 4096;
        return b;
      }
      function vj(a, b, c) {
        a.lanes |= b;
        var d = a.alternate;
        null !== d && (d.lanes |= b);
        bh(a.return, b, c);
      }
      function wj(a, b, c, d, e) {
        var f = a.memoizedState;
        null === f ? a.memoizedState = { isBackwards: b, rendering: null, renderingStartTime: 0, last: d, tail: c, tailMode: e } : (f.isBackwards = b, f.rendering = null, f.renderingStartTime = 0, f.last = d, f.tail = c, f.tailMode = e);
      }
      function xj(a, b, c) {
        var d = b.pendingProps, e = d.revealOrder, f = d.tail;
        Xi(a, b, d.children, c);
        d = L.current;
        if (0 !== (d & 2))
          d = d & 1 | 2, b.flags |= 128;
        else {
          if (null !== a && 0 !== (a.flags & 128))
            a:
              for (a = b.child; null !== a; ) {
                if (13 === a.tag)
                  null !== a.memoizedState && vj(a, c, b);
                else if (19 === a.tag)
                  vj(a, c, b);
                else if (null !== a.child) {
                  a.child.return = a;
                  a = a.child;
                  continue;
                }
                if (a === b)
                  break a;
                for (; null === a.sibling; ) {
                  if (null === a.return || a.return === b)
                    break a;
                  a = a.return;
                }
                a.sibling.return = a.return;
                a = a.sibling;
              }
          d &= 1;
        }
        G(L, d);
        if (0 === (b.mode & 1))
          b.memoizedState = null;
        else
          switch (e) {
            case "forwards":
              c = b.child;
              for (e = null; null !== c; )
                a = c.alternate, null !== a && null === Ch(a) && (e = c), c = c.sibling;
              c = e;
              null === c ? (e = b.child, b.child = null) : (e = c.sibling, c.sibling = null);
              wj(b, false, e, c, f);
              break;
            case "backwards":
              c = null;
              e = b.child;
              for (b.child = null; null !== e; ) {
                a = e.alternate;
                if (null !== a && null === Ch(a)) {
                  b.child = e;
                  break;
                }
                a = e.sibling;
                e.sibling = c;
                c = e;
                e = a;
              }
              wj(b, true, c, null, f);
              break;
            case "together":
              wj(b, false, null, null, void 0);
              break;
            default:
              b.memoizedState = null;
          }
        return b.child;
      }
      function ij(a, b) {
        0 === (b.mode & 1) && null !== a && (a.alternate = null, b.alternate = null, b.flags |= 2);
      }
      function Zi(a, b, c) {
        null !== a && (b.dependencies = a.dependencies);
        rh |= b.lanes;
        if (0 === (c & b.childLanes))
          return null;
        if (null !== a && b.child !== a.child)
          throw Error(p(153));
        if (null !== b.child) {
          a = b.child;
          c = Pg(a, a.pendingProps);
          b.child = c;
          for (c.return = b; null !== a.sibling; )
            a = a.sibling, c = c.sibling = Pg(a, a.pendingProps), c.return = b;
          c.sibling = null;
        }
        return b.child;
      }
      function yj(a, b, c) {
        switch (b.tag) {
          case 3:
            kj(b);
            Ig();
            break;
          case 5:
            Ah(b);
            break;
          case 1:
            Zf(b.type) && cg(b);
            break;
          case 4:
            yh(b, b.stateNode.containerInfo);
            break;
          case 10:
            var d = b.type._context, e = b.memoizedProps.value;
            G(Wg, d._currentValue);
            d._currentValue = e;
            break;
          case 13:
            d = b.memoizedState;
            if (null !== d) {
              if (null !== d.dehydrated)
                return G(L, L.current & 1), b.flags |= 128, null;
              if (0 !== (c & b.child.childLanes))
                return oj(a, b, c);
              G(L, L.current & 1);
              a = Zi(a, b, c);
              return null !== a ? a.sibling : null;
            }
            G(L, L.current & 1);
            break;
          case 19:
            d = 0 !== (c & b.childLanes);
            if (0 !== (a.flags & 128)) {
              if (d)
                return xj(a, b, c);
              b.flags |= 128;
            }
            e = b.memoizedState;
            null !== e && (e.rendering = null, e.tail = null, e.lastEffect = null);
            G(L, L.current);
            if (d)
              break;
            else
              return null;
          case 22:
          case 23:
            return b.lanes = 0, dj(a, b, c);
        }
        return Zi(a, b, c);
      }
      var zj;
      var Aj;
      var Bj;
      var Cj;
      zj = function(a, b) {
        for (var c = b.child; null !== c; ) {
          if (5 === c.tag || 6 === c.tag)
            a.appendChild(c.stateNode);
          else if (4 !== c.tag && null !== c.child) {
            c.child.return = c;
            c = c.child;
            continue;
          }
          if (c === b)
            break;
          for (; null === c.sibling; ) {
            if (null === c.return || c.return === b)
              return;
            c = c.return;
          }
          c.sibling.return = c.return;
          c = c.sibling;
        }
      };
      Aj = function() {
      };
      Bj = function(a, b, c, d) {
        var e = a.memoizedProps;
        if (e !== d) {
          a = b.stateNode;
          xh(uh.current);
          var f = null;
          switch (c) {
            case "input":
              e = Ya(a, e);
              d = Ya(a, d);
              f = [];
              break;
            case "select":
              e = A({}, e, { value: void 0 });
              d = A({}, d, { value: void 0 });
              f = [];
              break;
            case "textarea":
              e = gb(a, e);
              d = gb(a, d);
              f = [];
              break;
            default:
              "function" !== typeof e.onClick && "function" === typeof d.onClick && (a.onclick = Bf);
          }
          ub(c, d);
          var g;
          c = null;
          for (l in e)
            if (!d.hasOwnProperty(l) && e.hasOwnProperty(l) && null != e[l])
              if ("style" === l) {
                var h = e[l];
                for (g in h)
                  h.hasOwnProperty(g) && (c || (c = {}), c[g] = "");
              } else
                "dangerouslySetInnerHTML" !== l && "children" !== l && "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && "autoFocus" !== l && (ea.hasOwnProperty(l) ? f || (f = []) : (f = f || []).push(l, null));
          for (l in d) {
            var k = d[l];
            h = null != e ? e[l] : void 0;
            if (d.hasOwnProperty(l) && k !== h && (null != k || null != h))
              if ("style" === l)
                if (h) {
                  for (g in h)
                    !h.hasOwnProperty(g) || k && k.hasOwnProperty(g) || (c || (c = {}), c[g] = "");
                  for (g in k)
                    k.hasOwnProperty(g) && h[g] !== k[g] && (c || (c = {}), c[g] = k[g]);
                } else
                  c || (f || (f = []), f.push(
                    l,
                    c
                  )), c = k;
              else
                "dangerouslySetInnerHTML" === l ? (k = k ? k.__html : void 0, h = h ? h.__html : void 0, null != k && h !== k && (f = f || []).push(l, k)) : "children" === l ? "string" !== typeof k && "number" !== typeof k || (f = f || []).push(l, "" + k) : "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && (ea.hasOwnProperty(l) ? (null != k && "onScroll" === l && D("scroll", a), f || h === k || (f = [])) : (f = f || []).push(l, k));
          }
          c && (f = f || []).push("style", c);
          var l = f;
          if (b.updateQueue = l)
            b.flags |= 4;
        }
      };
      Cj = function(a, b, c, d) {
        c !== d && (b.flags |= 4);
      };
      function Dj(a, b) {
        if (!I)
          switch (a.tailMode) {
            case "hidden":
              b = a.tail;
              for (var c = null; null !== b; )
                null !== b.alternate && (c = b), b = b.sibling;
              null === c ? a.tail = null : c.sibling = null;
              break;
            case "collapsed":
              c = a.tail;
              for (var d = null; null !== c; )
                null !== c.alternate && (d = c), c = c.sibling;
              null === d ? b || null === a.tail ? a.tail = null : a.tail.sibling = null : d.sibling = null;
          }
      }
      function S(a) {
        var b = null !== a.alternate && a.alternate.child === a.child, c = 0, d = 0;
        if (b)
          for (var e = a.child; null !== e; )
            c |= e.lanes | e.childLanes, d |= e.subtreeFlags & 14680064, d |= e.flags & 14680064, e.return = a, e = e.sibling;
        else
          for (e = a.child; null !== e; )
            c |= e.lanes | e.childLanes, d |= e.subtreeFlags, d |= e.flags, e.return = a, e = e.sibling;
        a.subtreeFlags |= d;
        a.childLanes = c;
        return b;
      }
      function Ej(a, b, c) {
        var d = b.pendingProps;
        wg(b);
        switch (b.tag) {
          case 2:
          case 16:
          case 15:
          case 0:
          case 11:
          case 7:
          case 8:
          case 12:
          case 9:
          case 14:
            return S(b), null;
          case 1:
            return Zf(b.type) && $f(), S(b), null;
          case 3:
            d = b.stateNode;
            zh();
            E(Wf);
            E(H);
            Eh();
            d.pendingContext && (d.context = d.pendingContext, d.pendingContext = null);
            if (null === a || null === a.child)
              Gg(b) ? b.flags |= 4 : null === a || a.memoizedState.isDehydrated && 0 === (b.flags & 256) || (b.flags |= 1024, null !== zg && (Fj(zg), zg = null));
            Aj(a, b);
            S(b);
            return null;
          case 5:
            Bh(b);
            var e = xh(wh.current);
            c = b.type;
            if (null !== a && null != b.stateNode)
              Bj(a, b, c, d, e), a.ref !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            else {
              if (!d) {
                if (null === b.stateNode)
                  throw Error(p(166));
                S(b);
                return null;
              }
              a = xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.type;
                var f = b.memoizedProps;
                d[Of] = b;
                d[Pf] = f;
                a = 0 !== (b.mode & 1);
                switch (c) {
                  case "dialog":
                    D("cancel", d);
                    D("close", d);
                    break;
                  case "iframe":
                  case "object":
                  case "embed":
                    D("load", d);
                    break;
                  case "video":
                  case "audio":
                    for (e = 0; e < lf.length; e++)
                      D(lf[e], d);
                    break;
                  case "source":
                    D("error", d);
                    break;
                  case "img":
                  case "image":
                  case "link":
                    D(
                      "error",
                      d
                    );
                    D("load", d);
                    break;
                  case "details":
                    D("toggle", d);
                    break;
                  case "input":
                    Za(d, f);
                    D("invalid", d);
                    break;
                  case "select":
                    d._wrapperState = { wasMultiple: !!f.multiple };
                    D("invalid", d);
                    break;
                  case "textarea":
                    hb(d, f), D("invalid", d);
                }
                ub(c, f);
                e = null;
                for (var g in f)
                  if (f.hasOwnProperty(g)) {
                    var h = f[g];
                    "children" === g ? "string" === typeof h ? d.textContent !== h && (true !== f.suppressHydrationWarning && Af(d.textContent, h, a), e = ["children", h]) : "number" === typeof h && d.textContent !== "" + h && (true !== f.suppressHydrationWarning && Af(
                      d.textContent,
                      h,
                      a
                    ), e = ["children", "" + h]) : ea.hasOwnProperty(g) && null != h && "onScroll" === g && D("scroll", d);
                  }
                switch (c) {
                  case "input":
                    Va(d);
                    db(d, f, true);
                    break;
                  case "textarea":
                    Va(d);
                    jb(d);
                    break;
                  case "select":
                  case "option":
                    break;
                  default:
                    "function" === typeof f.onClick && (d.onclick = Bf);
                }
                d = e;
                b.updateQueue = d;
                null !== d && (b.flags |= 4);
              } else {
                g = 9 === e.nodeType ? e : e.ownerDocument;
                "http://www.w3.org/1999/xhtml" === a && (a = kb(c));
                "http://www.w3.org/1999/xhtml" === a ? "script" === c ? (a = g.createElement("div"), a.innerHTML = "<script><\/script>", a = a.removeChild(a.firstChild)) : "string" === typeof d.is ? a = g.createElement(c, { is: d.is }) : (a = g.createElement(c), "select" === c && (g = a, d.multiple ? g.multiple = true : d.size && (g.size = d.size))) : a = g.createElementNS(a, c);
                a[Of] = b;
                a[Pf] = d;
                zj(a, b, false, false);
                b.stateNode = a;
                a: {
                  g = vb(c, d);
                  switch (c) {
                    case "dialog":
                      D("cancel", a);
                      D("close", a);
                      e = d;
                      break;
                    case "iframe":
                    case "object":
                    case "embed":
                      D("load", a);
                      e = d;
                      break;
                    case "video":
                    case "audio":
                      for (e = 0; e < lf.length; e++)
                        D(lf[e], a);
                      e = d;
                      break;
                    case "source":
                      D("error", a);
                      e = d;
                      break;
                    case "img":
                    case "image":
                    case "link":
                      D(
                        "error",
                        a
                      );
                      D("load", a);
                      e = d;
                      break;
                    case "details":
                      D("toggle", a);
                      e = d;
                      break;
                    case "input":
                      Za(a, d);
                      e = Ya(a, d);
                      D("invalid", a);
                      break;
                    case "option":
                      e = d;
                      break;
                    case "select":
                      a._wrapperState = { wasMultiple: !!d.multiple };
                      e = A({}, d, { value: void 0 });
                      D("invalid", a);
                      break;
                    case "textarea":
                      hb(a, d);
                      e = gb(a, d);
                      D("invalid", a);
                      break;
                    default:
                      e = d;
                  }
                  ub(c, e);
                  h = e;
                  for (f in h)
                    if (h.hasOwnProperty(f)) {
                      var k = h[f];
                      "style" === f ? sb(a, k) : "dangerouslySetInnerHTML" === f ? (k = k ? k.__html : void 0, null != k && nb(a, k)) : "children" === f ? "string" === typeof k ? ("textarea" !== c || "" !== k) && ob(a, k) : "number" === typeof k && ob(a, "" + k) : "suppressContentEditableWarning" !== f && "suppressHydrationWarning" !== f && "autoFocus" !== f && (ea.hasOwnProperty(f) ? null != k && "onScroll" === f && D("scroll", a) : null != k && ta(a, f, k, g));
                    }
                  switch (c) {
                    case "input":
                      Va(a);
                      db(a, d, false);
                      break;
                    case "textarea":
                      Va(a);
                      jb(a);
                      break;
                    case "option":
                      null != d.value && a.setAttribute("value", "" + Sa(d.value));
                      break;
                    case "select":
                      a.multiple = !!d.multiple;
                      f = d.value;
                      null != f ? fb(a, !!d.multiple, f, false) : null != d.defaultValue && fb(
                        a,
                        !!d.multiple,
                        d.defaultValue,
                        true
                      );
                      break;
                    default:
                      "function" === typeof e.onClick && (a.onclick = Bf);
                  }
                  switch (c) {
                    case "button":
                    case "input":
                    case "select":
                    case "textarea":
                      d = !!d.autoFocus;
                      break a;
                    case "img":
                      d = true;
                      break a;
                    default:
                      d = false;
                  }
                }
                d && (b.flags |= 4);
              }
              null !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            }
            S(b);
            return null;
          case 6:
            if (a && null != b.stateNode)
              Cj(a, b, a.memoizedProps, d);
            else {
              if ("string" !== typeof d && null === b.stateNode)
                throw Error(p(166));
              c = xh(wh.current);
              xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.memoizedProps;
                d[Of] = b;
                if (f = d.nodeValue !== c) {
                  if (a = xg, null !== a)
                    switch (a.tag) {
                      case 3:
                        Af(d.nodeValue, c, 0 !== (a.mode & 1));
                        break;
                      case 5:
                        true !== a.memoizedProps.suppressHydrationWarning && Af(d.nodeValue, c, 0 !== (a.mode & 1));
                    }
                }
                f && (b.flags |= 4);
              } else
                d = (9 === c.nodeType ? c : c.ownerDocument).createTextNode(d), d[Of] = b, b.stateNode = d;
            }
            S(b);
            return null;
          case 13:
            E(L);
            d = b.memoizedState;
            if (null === a || null !== a.memoizedState && null !== a.memoizedState.dehydrated) {
              if (I && null !== yg && 0 !== (b.mode & 1) && 0 === (b.flags & 128))
                Hg(), Ig(), b.flags |= 98560, f = false;
              else if (f = Gg(b), null !== d && null !== d.dehydrated) {
                if (null === a) {
                  if (!f)
                    throw Error(p(318));
                  f = b.memoizedState;
                  f = null !== f ? f.dehydrated : null;
                  if (!f)
                    throw Error(p(317));
                  f[Of] = b;
                } else
                  Ig(), 0 === (b.flags & 128) && (b.memoizedState = null), b.flags |= 4;
                S(b);
                f = false;
              } else
                null !== zg && (Fj(zg), zg = null), f = true;
              if (!f)
                return b.flags & 65536 ? b : null;
            }
            if (0 !== (b.flags & 128))
              return b.lanes = c, b;
            d = null !== d;
            d !== (null !== a && null !== a.memoizedState) && d && (b.child.flags |= 8192, 0 !== (b.mode & 1) && (null === a || 0 !== (L.current & 1) ? 0 === T && (T = 3) : tj()));
            null !== b.updateQueue && (b.flags |= 4);
            S(b);
            return null;
          case 4:
            return zh(), Aj(a, b), null === a && sf(b.stateNode.containerInfo), S(b), null;
          case 10:
            return ah(b.type._context), S(b), null;
          case 17:
            return Zf(b.type) && $f(), S(b), null;
          case 19:
            E(L);
            f = b.memoizedState;
            if (null === f)
              return S(b), null;
            d = 0 !== (b.flags & 128);
            g = f.rendering;
            if (null === g)
              if (d)
                Dj(f, false);
              else {
                if (0 !== T || null !== a && 0 !== (a.flags & 128))
                  for (a = b.child; null !== a; ) {
                    g = Ch(a);
                    if (null !== g) {
                      b.flags |= 128;
                      Dj(f, false);
                      d = g.updateQueue;
                      null !== d && (b.updateQueue = d, b.flags |= 4);
                      b.subtreeFlags = 0;
                      d = c;
                      for (c = b.child; null !== c; )
                        f = c, a = d, f.flags &= 14680066, g = f.alternate, null === g ? (f.childLanes = 0, f.lanes = a, f.child = null, f.subtreeFlags = 0, f.memoizedProps = null, f.memoizedState = null, f.updateQueue = null, f.dependencies = null, f.stateNode = null) : (f.childLanes = g.childLanes, f.lanes = g.lanes, f.child = g.child, f.subtreeFlags = 0, f.deletions = null, f.memoizedProps = g.memoizedProps, f.memoizedState = g.memoizedState, f.updateQueue = g.updateQueue, f.type = g.type, a = g.dependencies, f.dependencies = null === a ? null : { lanes: a.lanes, firstContext: a.firstContext }), c = c.sibling;
                      G(L, L.current & 1 | 2);
                      return b.child;
                    }
                    a = a.sibling;
                  }
                null !== f.tail && B() > Gj && (b.flags |= 128, d = true, Dj(f, false), b.lanes = 4194304);
              }
            else {
              if (!d)
                if (a = Ch(g), null !== a) {
                  if (b.flags |= 128, d = true, c = a.updateQueue, null !== c && (b.updateQueue = c, b.flags |= 4), Dj(f, true), null === f.tail && "hidden" === f.tailMode && !g.alternate && !I)
                    return S(b), null;
                } else
                  2 * B() - f.renderingStartTime > Gj && 1073741824 !== c && (b.flags |= 128, d = true, Dj(f, false), b.lanes = 4194304);
              f.isBackwards ? (g.sibling = b.child, b.child = g) : (c = f.last, null !== c ? c.sibling = g : b.child = g, f.last = g);
            }
            if (null !== f.tail)
              return b = f.tail, f.rendering = b, f.tail = b.sibling, f.renderingStartTime = B(), b.sibling = null, c = L.current, G(L, d ? c & 1 | 2 : c & 1), b;
            S(b);
            return null;
          case 22:
          case 23:
            return Hj(), d = null !== b.memoizedState, null !== a && null !== a.memoizedState !== d && (b.flags |= 8192), d && 0 !== (b.mode & 1) ? 0 !== (fj & 1073741824) && (S(b), b.subtreeFlags & 6 && (b.flags |= 8192)) : S(b), null;
          case 24:
            return null;
          case 25:
            return null;
        }
        throw Error(p(156, b.tag));
      }
      function Ij(a, b) {
        wg(b);
        switch (b.tag) {
          case 1:
            return Zf(b.type) && $f(), a = b.flags, a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 3:
            return zh(), E(Wf), E(H), Eh(), a = b.flags, 0 !== (a & 65536) && 0 === (a & 128) ? (b.flags = a & -65537 | 128, b) : null;
          case 5:
            return Bh(b), null;
          case 13:
            E(L);
            a = b.memoizedState;
            if (null !== a && null !== a.dehydrated) {
              if (null === b.alternate)
                throw Error(p(340));
              Ig();
            }
            a = b.flags;
            return a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 19:
            return E(L), null;
          case 4:
            return zh(), null;
          case 10:
            return ah(b.type._context), null;
          case 22:
          case 23:
            return Hj(), null;
          case 24:
            return null;
          default:
            return null;
        }
      }
      var Jj = false;
      var U = false;
      var Kj = "function" === typeof WeakSet ? WeakSet : Set;
      var V = null;
      function Lj(a, b) {
        var c = a.ref;
        if (null !== c)
          if ("function" === typeof c)
            try {
              c(null);
            } catch (d) {
              W(a, b, d);
            }
          else
            c.current = null;
      }
      function Mj(a, b, c) {
        try {
          c();
        } catch (d) {
          W(a, b, d);
        }
      }
      var Nj = false;
      function Oj(a, b) {
        Cf = dd;
        a = Me();
        if (Ne(a)) {
          if ("selectionStart" in a)
            var c = { start: a.selectionStart, end: a.selectionEnd };
          else
            a: {
              c = (c = a.ownerDocument) && c.defaultView || window;
              var d = c.getSelection && c.getSelection();
              if (d && 0 !== d.rangeCount) {
                c = d.anchorNode;
                var e = d.anchorOffset, f = d.focusNode;
                d = d.focusOffset;
                try {
                  c.nodeType, f.nodeType;
                } catch (F) {
                  c = null;
                  break a;
                }
                var g = 0, h = -1, k = -1, l = 0, m = 0, q = a, r = null;
                b:
                  for (; ; ) {
                    for (var y; ; ) {
                      q !== c || 0 !== e && 3 !== q.nodeType || (h = g + e);
                      q !== f || 0 !== d && 3 !== q.nodeType || (k = g + d);
                      3 === q.nodeType && (g += q.nodeValue.length);
                      if (null === (y = q.firstChild))
                        break;
                      r = q;
                      q = y;
                    }
                    for (; ; ) {
                      if (q === a)
                        break b;
                      r === c && ++l === e && (h = g);
                      r === f && ++m === d && (k = g);
                      if (null !== (y = q.nextSibling))
                        break;
                      q = r;
                      r = q.parentNode;
                    }
                    q = y;
                  }
                c = -1 === h || -1 === k ? null : { start: h, end: k };
              } else
                c = null;
            }
          c = c || { start: 0, end: 0 };
        } else
          c = null;
        Df = { focusedElem: a, selectionRange: c };
        dd = false;
        for (V = b; null !== V; )
          if (b = V, a = b.child, 0 !== (b.subtreeFlags & 1028) && null !== a)
            a.return = b, V = a;
          else
            for (; null !== V; ) {
              b = V;
              try {
                var n = b.alternate;
                if (0 !== (b.flags & 1024))
                  switch (b.tag) {
                    case 0:
                    case 11:
                    case 15:
                      break;
                    case 1:
                      if (null !== n) {
                        var t = n.memoizedProps, J = n.memoizedState, x = b.stateNode, w = x.getSnapshotBeforeUpdate(b.elementType === b.type ? t : Ci(b.type, t), J);
                        x.__reactInternalSnapshotBeforeUpdate = w;
                      }
                      break;
                    case 3:
                      var u = b.stateNode.containerInfo;
                      1 === u.nodeType ? u.textContent = "" : 9 === u.nodeType && u.documentElement && u.removeChild(u.documentElement);
                      break;
                    case 5:
                    case 6:
                    case 4:
                    case 17:
                      break;
                    default:
                      throw Error(p(163));
                  }
              } catch (F) {
                W(b, b.return, F);
              }
              a = b.sibling;
              if (null !== a) {
                a.return = b.return;
                V = a;
                break;
              }
              V = b.return;
            }
        n = Nj;
        Nj = false;
        return n;
      }
      function Pj(a, b, c) {
        var d = b.updateQueue;
        d = null !== d ? d.lastEffect : null;
        if (null !== d) {
          var e = d = d.next;
          do {
            if ((e.tag & a) === a) {
              var f = e.destroy;
              e.destroy = void 0;
              void 0 !== f && Mj(b, c, f);
            }
            e = e.next;
          } while (e !== d);
        }
      }
      function Qj(a, b) {
        b = b.updateQueue;
        b = null !== b ? b.lastEffect : null;
        if (null !== b) {
          var c = b = b.next;
          do {
            if ((c.tag & a) === a) {
              var d = c.create;
              c.destroy = d();
            }
            c = c.next;
          } while (c !== b);
        }
      }
      function Rj(a) {
        var b = a.ref;
        if (null !== b) {
          var c = a.stateNode;
          switch (a.tag) {
            case 5:
              a = c;
              break;
            default:
              a = c;
          }
          "function" === typeof b ? b(a) : b.current = a;
        }
      }
      function Sj(a) {
        var b = a.alternate;
        null !== b && (a.alternate = null, Sj(b));
        a.child = null;
        a.deletions = null;
        a.sibling = null;
        5 === a.tag && (b = a.stateNode, null !== b && (delete b[Of], delete b[Pf], delete b[of], delete b[Qf], delete b[Rf]));
        a.stateNode = null;
        a.return = null;
        a.dependencies = null;
        a.memoizedProps = null;
        a.memoizedState = null;
        a.pendingProps = null;
        a.stateNode = null;
        a.updateQueue = null;
      }
      function Tj(a) {
        return 5 === a.tag || 3 === a.tag || 4 === a.tag;
      }
      function Uj(a) {
        a:
          for (; ; ) {
            for (; null === a.sibling; ) {
              if (null === a.return || Tj(a.return))
                return null;
              a = a.return;
            }
            a.sibling.return = a.return;
            for (a = a.sibling; 5 !== a.tag && 6 !== a.tag && 18 !== a.tag; ) {
              if (a.flags & 2)
                continue a;
              if (null === a.child || 4 === a.tag)
                continue a;
              else
                a.child.return = a, a = a.child;
            }
            if (!(a.flags & 2))
              return a.stateNode;
          }
      }
      function Vj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d)
          a = a.stateNode, b ? 8 === c.nodeType ? c.parentNode.insertBefore(a, b) : c.insertBefore(a, b) : (8 === c.nodeType ? (b = c.parentNode, b.insertBefore(a, c)) : (b = c, b.appendChild(a)), c = c._reactRootContainer, null !== c && void 0 !== c || null !== b.onclick || (b.onclick = Bf));
        else if (4 !== d && (a = a.child, null !== a))
          for (Vj(a, b, c), a = a.sibling; null !== a; )
            Vj(a, b, c), a = a.sibling;
      }
      function Wj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d)
          a = a.stateNode, b ? c.insertBefore(a, b) : c.appendChild(a);
        else if (4 !== d && (a = a.child, null !== a))
          for (Wj(a, b, c), a = a.sibling; null !== a; )
            Wj(a, b, c), a = a.sibling;
      }
      var X = null;
      var Xj = false;
      function Yj(a, b, c) {
        for (c = c.child; null !== c; )
          Zj(a, b, c), c = c.sibling;
      }
      function Zj(a, b, c) {
        if (lc && "function" === typeof lc.onCommitFiberUnmount)
          try {
            lc.onCommitFiberUnmount(kc, c);
          } catch (h) {
          }
        switch (c.tag) {
          case 5:
            U || Lj(c, b);
          case 6:
            var d = X, e = Xj;
            X = null;
            Yj(a, b, c);
            X = d;
            Xj = e;
            null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? a.parentNode.removeChild(c) : a.removeChild(c)) : X.removeChild(c.stateNode));
            break;
          case 18:
            null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? Kf(a.parentNode, c) : 1 === a.nodeType && Kf(a, c), bd(a)) : Kf(X, c.stateNode));
            break;
          case 4:
            d = X;
            e = Xj;
            X = c.stateNode.containerInfo;
            Xj = true;
            Yj(a, b, c);
            X = d;
            Xj = e;
            break;
          case 0:
          case 11:
          case 14:
          case 15:
            if (!U && (d = c.updateQueue, null !== d && (d = d.lastEffect, null !== d))) {
              e = d = d.next;
              do {
                var f = e, g = f.destroy;
                f = f.tag;
                void 0 !== g && (0 !== (f & 2) ? Mj(c, b, g) : 0 !== (f & 4) && Mj(c, b, g));
                e = e.next;
              } while (e !== d);
            }
            Yj(a, b, c);
            break;
          case 1:
            if (!U && (Lj(c, b), d = c.stateNode, "function" === typeof d.componentWillUnmount))
              try {
                d.props = c.memoizedProps, d.state = c.memoizedState, d.componentWillUnmount();
              } catch (h) {
                W(c, b, h);
              }
            Yj(a, b, c);
            break;
          case 21:
            Yj(a, b, c);
            break;
          case 22:
            c.mode & 1 ? (U = (d = U) || null !== c.memoizedState, Yj(a, b, c), U = d) : Yj(a, b, c);
            break;
          default:
            Yj(a, b, c);
        }
      }
      function ak(a) {
        var b = a.updateQueue;
        if (null !== b) {
          a.updateQueue = null;
          var c = a.stateNode;
          null === c && (c = a.stateNode = new Kj());
          b.forEach(function(b2) {
            var d = bk.bind(null, a, b2);
            c.has(b2) || (c.add(b2), b2.then(d, d));
          });
        }
      }
      function ck(a, b) {
        var c = b.deletions;
        if (null !== c)
          for (var d = 0; d < c.length; d++) {
            var e = c[d];
            try {
              var f = a, g = b, h = g;
              a:
                for (; null !== h; ) {
                  switch (h.tag) {
                    case 5:
                      X = h.stateNode;
                      Xj = false;
                      break a;
                    case 3:
                      X = h.stateNode.containerInfo;
                      Xj = true;
                      break a;
                    case 4:
                      X = h.stateNode.containerInfo;
                      Xj = true;
                      break a;
                  }
                  h = h.return;
                }
              if (null === X)
                throw Error(p(160));
              Zj(f, g, e);
              X = null;
              Xj = false;
              var k = e.alternate;
              null !== k && (k.return = null);
              e.return = null;
            } catch (l) {
              W(e, b, l);
            }
          }
        if (b.subtreeFlags & 12854)
          for (b = b.child; null !== b; )
            dk(b, a), b = b.sibling;
      }
      function dk(a, b) {
        var c = a.alternate, d = a.flags;
        switch (a.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            ck(b, a);
            ek(a);
            if (d & 4) {
              try {
                Pj(3, a, a.return), Qj(3, a);
              } catch (t) {
                W(a, a.return, t);
              }
              try {
                Pj(5, a, a.return);
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 1:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            break;
          case 5:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            if (a.flags & 32) {
              var e = a.stateNode;
              try {
                ob(e, "");
              } catch (t) {
                W(a, a.return, t);
              }
            }
            if (d & 4 && (e = a.stateNode, null != e)) {
              var f = a.memoizedProps, g = null !== c ? c.memoizedProps : f, h = a.type, k = a.updateQueue;
              a.updateQueue = null;
              if (null !== k)
                try {
                  "input" === h && "radio" === f.type && null != f.name && ab(e, f);
                  vb(h, g);
                  var l = vb(h, f);
                  for (g = 0; g < k.length; g += 2) {
                    var m = k[g], q = k[g + 1];
                    "style" === m ? sb(e, q) : "dangerouslySetInnerHTML" === m ? nb(e, q) : "children" === m ? ob(e, q) : ta(e, m, q, l);
                  }
                  switch (h) {
                    case "input":
                      bb(e, f);
                      break;
                    case "textarea":
                      ib(e, f);
                      break;
                    case "select":
                      var r = e._wrapperState.wasMultiple;
                      e._wrapperState.wasMultiple = !!f.multiple;
                      var y = f.value;
                      null != y ? fb(e, !!f.multiple, y, false) : r !== !!f.multiple && (null != f.defaultValue ? fb(
                        e,
                        !!f.multiple,
                        f.defaultValue,
                        true
                      ) : fb(e, !!f.multiple, f.multiple ? [] : "", false));
                  }
                  e[Pf] = f;
                } catch (t) {
                  W(a, a.return, t);
                }
            }
            break;
          case 6:
            ck(b, a);
            ek(a);
            if (d & 4) {
              if (null === a.stateNode)
                throw Error(p(162));
              e = a.stateNode;
              f = a.memoizedProps;
              try {
                e.nodeValue = f;
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 3:
            ck(b, a);
            ek(a);
            if (d & 4 && null !== c && c.memoizedState.isDehydrated)
              try {
                bd(b.containerInfo);
              } catch (t) {
                W(a, a.return, t);
              }
            break;
          case 4:
            ck(b, a);
            ek(a);
            break;
          case 13:
            ck(b, a);
            ek(a);
            e = a.child;
            e.flags & 8192 && (f = null !== e.memoizedState, e.stateNode.isHidden = f, !f || null !== e.alternate && null !== e.alternate.memoizedState || (fk = B()));
            d & 4 && ak(a);
            break;
          case 22:
            m = null !== c && null !== c.memoizedState;
            a.mode & 1 ? (U = (l = U) || m, ck(b, a), U = l) : ck(b, a);
            ek(a);
            if (d & 8192) {
              l = null !== a.memoizedState;
              if ((a.stateNode.isHidden = l) && !m && 0 !== (a.mode & 1))
                for (V = a, m = a.child; null !== m; ) {
                  for (q = V = m; null !== V; ) {
                    r = V;
                    y = r.child;
                    switch (r.tag) {
                      case 0:
                      case 11:
                      case 14:
                      case 15:
                        Pj(4, r, r.return);
                        break;
                      case 1:
                        Lj(r, r.return);
                        var n = r.stateNode;
                        if ("function" === typeof n.componentWillUnmount) {
                          d = r;
                          c = r.return;
                          try {
                            b = d, n.props = b.memoizedProps, n.state = b.memoizedState, n.componentWillUnmount();
                          } catch (t) {
                            W(d, c, t);
                          }
                        }
                        break;
                      case 5:
                        Lj(r, r.return);
                        break;
                      case 22:
                        if (null !== r.memoizedState) {
                          gk(q);
                          continue;
                        }
                    }
                    null !== y ? (y.return = r, V = y) : gk(q);
                  }
                  m = m.sibling;
                }
              a:
                for (m = null, q = a; ; ) {
                  if (5 === q.tag) {
                    if (null === m) {
                      m = q;
                      try {
                        e = q.stateNode, l ? (f = e.style, "function" === typeof f.setProperty ? f.setProperty("display", "none", "important") : f.display = "none") : (h = q.stateNode, k = q.memoizedProps.style, g = void 0 !== k && null !== k && k.hasOwnProperty("display") ? k.display : null, h.style.display = rb("display", g));
                      } catch (t) {
                        W(a, a.return, t);
                      }
                    }
                  } else if (6 === q.tag) {
                    if (null === m)
                      try {
                        q.stateNode.nodeValue = l ? "" : q.memoizedProps;
                      } catch (t) {
                        W(a, a.return, t);
                      }
                  } else if ((22 !== q.tag && 23 !== q.tag || null === q.memoizedState || q === a) && null !== q.child) {
                    q.child.return = q;
                    q = q.child;
                    continue;
                  }
                  if (q === a)
                    break a;
                  for (; null === q.sibling; ) {
                    if (null === q.return || q.return === a)
                      break a;
                    m === q && (m = null);
                    q = q.return;
                  }
                  m === q && (m = null);
                  q.sibling.return = q.return;
                  q = q.sibling;
                }
            }
            break;
          case 19:
            ck(b, a);
            ek(a);
            d & 4 && ak(a);
            break;
          case 21:
            break;
          default:
            ck(
              b,
              a
            ), ek(a);
        }
      }
      function ek(a) {
        var b = a.flags;
        if (b & 2) {
          try {
            a: {
              for (var c = a.return; null !== c; ) {
                if (Tj(c)) {
                  var d = c;
                  break a;
                }
                c = c.return;
              }
              throw Error(p(160));
            }
            switch (d.tag) {
              case 5:
                var e = d.stateNode;
                d.flags & 32 && (ob(e, ""), d.flags &= -33);
                var f = Uj(a);
                Wj(a, f, e);
                break;
              case 3:
              case 4:
                var g = d.stateNode.containerInfo, h = Uj(a);
                Vj(a, h, g);
                break;
              default:
                throw Error(p(161));
            }
          } catch (k) {
            W(a, a.return, k);
          }
          a.flags &= -3;
        }
        b & 4096 && (a.flags &= -4097);
      }
      function hk(a, b, c) {
        V = a;
        ik(a, b, c);
      }
      function ik(a, b, c) {
        for (var d = 0 !== (a.mode & 1); null !== V; ) {
          var e = V, f = e.child;
          if (22 === e.tag && d) {
            var g = null !== e.memoizedState || Jj;
            if (!g) {
              var h = e.alternate, k = null !== h && null !== h.memoizedState || U;
              h = Jj;
              var l = U;
              Jj = g;
              if ((U = k) && !l)
                for (V = e; null !== V; )
                  g = V, k = g.child, 22 === g.tag && null !== g.memoizedState ? jk(e) : null !== k ? (k.return = g, V = k) : jk(e);
              for (; null !== f; )
                V = f, ik(f, b, c), f = f.sibling;
              V = e;
              Jj = h;
              U = l;
            }
            kk(a, b, c);
          } else
            0 !== (e.subtreeFlags & 8772) && null !== f ? (f.return = e, V = f) : kk(a, b, c);
        }
      }
      function kk(a) {
        for (; null !== V; ) {
          var b = V;
          if (0 !== (b.flags & 8772)) {
            var c = b.alternate;
            try {
              if (0 !== (b.flags & 8772))
                switch (b.tag) {
                  case 0:
                  case 11:
                  case 15:
                    U || Qj(5, b);
                    break;
                  case 1:
                    var d = b.stateNode;
                    if (b.flags & 4 && !U)
                      if (null === c)
                        d.componentDidMount();
                      else {
                        var e = b.elementType === b.type ? c.memoizedProps : Ci(b.type, c.memoizedProps);
                        d.componentDidUpdate(e, c.memoizedState, d.__reactInternalSnapshotBeforeUpdate);
                      }
                    var f = b.updateQueue;
                    null !== f && sh(b, f, d);
                    break;
                  case 3:
                    var g = b.updateQueue;
                    if (null !== g) {
                      c = null;
                      if (null !== b.child)
                        switch (b.child.tag) {
                          case 5:
                            c = b.child.stateNode;
                            break;
                          case 1:
                            c = b.child.stateNode;
                        }
                      sh(b, g, c);
                    }
                    break;
                  case 5:
                    var h = b.stateNode;
                    if (null === c && b.flags & 4) {
                      c = h;
                      var k = b.memoizedProps;
                      switch (b.type) {
                        case "button":
                        case "input":
                        case "select":
                        case "textarea":
                          k.autoFocus && c.focus();
                          break;
                        case "img":
                          k.src && (c.src = k.src);
                      }
                    }
                    break;
                  case 6:
                    break;
                  case 4:
                    break;
                  case 12:
                    break;
                  case 13:
                    if (null === b.memoizedState) {
                      var l = b.alternate;
                      if (null !== l) {
                        var m = l.memoizedState;
                        if (null !== m) {
                          var q = m.dehydrated;
                          null !== q && bd(q);
                        }
                      }
                    }
                    break;
                  case 19:
                  case 17:
                  case 21:
                  case 22:
                  case 23:
                  case 25:
                    break;
                  default:
                    throw Error(p(163));
                }
              U || b.flags & 512 && Rj(b);
            } catch (r) {
              W(b, b.return, r);
            }
          }
          if (b === a) {
            V = null;
            break;
          }
          c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function gk(a) {
        for (; null !== V; ) {
          var b = V;
          if (b === a) {
            V = null;
            break;
          }
          var c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function jk(a) {
        for (; null !== V; ) {
          var b = V;
          try {
            switch (b.tag) {
              case 0:
              case 11:
              case 15:
                var c = b.return;
                try {
                  Qj(4, b);
                } catch (k) {
                  W(b, c, k);
                }
                break;
              case 1:
                var d = b.stateNode;
                if ("function" === typeof d.componentDidMount) {
                  var e = b.return;
                  try {
                    d.componentDidMount();
                  } catch (k) {
                    W(b, e, k);
                  }
                }
                var f = b.return;
                try {
                  Rj(b);
                } catch (k) {
                  W(b, f, k);
                }
                break;
              case 5:
                var g = b.return;
                try {
                  Rj(b);
                } catch (k) {
                  W(b, g, k);
                }
            }
          } catch (k) {
            W(b, b.return, k);
          }
          if (b === a) {
            V = null;
            break;
          }
          var h = b.sibling;
          if (null !== h) {
            h.return = b.return;
            V = h;
            break;
          }
          V = b.return;
        }
      }
      var lk = Math.ceil;
      var mk = ua.ReactCurrentDispatcher;
      var nk = ua.ReactCurrentOwner;
      var ok = ua.ReactCurrentBatchConfig;
      var K = 0;
      var Q = null;
      var Y = null;
      var Z = 0;
      var fj = 0;
      var ej = Uf(0);
      var T = 0;
      var pk = null;
      var rh = 0;
      var qk = 0;
      var rk = 0;
      var sk = null;
      var tk = null;
      var fk = 0;
      var Gj = Infinity;
      var uk = null;
      var Oi = false;
      var Pi = null;
      var Ri = null;
      var vk = false;
      var wk = null;
      var xk = 0;
      var yk = 0;
      var zk = null;
      var Ak = -1;
      var Bk = 0;
      function R() {
        return 0 !== (K & 6) ? B() : -1 !== Ak ? Ak : Ak = B();
      }
      function yi(a) {
        if (0 === (a.mode & 1))
          return 1;
        if (0 !== (K & 2) && 0 !== Z)
          return Z & -Z;
        if (null !== Kg.transition)
          return 0 === Bk && (Bk = yc()), Bk;
        a = C;
        if (0 !== a)
          return a;
        a = window.event;
        a = void 0 === a ? 16 : jd(a.type);
        return a;
      }
      function gi(a, b, c, d) {
        if (50 < yk)
          throw yk = 0, zk = null, Error(p(185));
        Ac(a, c, d);
        if (0 === (K & 2) || a !== Q)
          a === Q && (0 === (K & 2) && (qk |= c), 4 === T && Ck(a, Z)), Dk(a, d), 1 === c && 0 === K && 0 === (b.mode & 1) && (Gj = B() + 500, fg && jg());
      }
      function Dk(a, b) {
        var c = a.callbackNode;
        wc(a, b);
        var d = uc(a, a === Q ? Z : 0);
        if (0 === d)
          null !== c && bc(c), a.callbackNode = null, a.callbackPriority = 0;
        else if (b = d & -d, a.callbackPriority !== b) {
          null != c && bc(c);
          if (1 === b)
            0 === a.tag ? ig(Ek.bind(null, a)) : hg(Ek.bind(null, a)), Jf(function() {
              0 === (K & 6) && jg();
            }), c = null;
          else {
            switch (Dc(d)) {
              case 1:
                c = fc;
                break;
              case 4:
                c = gc;
                break;
              case 16:
                c = hc;
                break;
              case 536870912:
                c = jc;
                break;
              default:
                c = hc;
            }
            c = Fk(c, Gk.bind(null, a));
          }
          a.callbackPriority = b;
          a.callbackNode = c;
        }
      }
      function Gk(a, b) {
        Ak = -1;
        Bk = 0;
        if (0 !== (K & 6))
          throw Error(p(327));
        var c = a.callbackNode;
        if (Hk() && a.callbackNode !== c)
          return null;
        var d = uc(a, a === Q ? Z : 0);
        if (0 === d)
          return null;
        if (0 !== (d & 30) || 0 !== (d & a.expiredLanes) || b)
          b = Ik(a, d);
        else {
          b = d;
          var e = K;
          K |= 2;
          var f = Jk();
          if (Q !== a || Z !== b)
            uk = null, Gj = B() + 500, Kk(a, b);
          do
            try {
              Lk();
              break;
            } catch (h) {
              Mk(a, h);
            }
          while (1);
          $g();
          mk.current = f;
          K = e;
          null !== Y ? b = 0 : (Q = null, Z = 0, b = T);
        }
        if (0 !== b) {
          2 === b && (e = xc(a), 0 !== e && (d = e, b = Nk(a, e)));
          if (1 === b)
            throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
          if (6 === b)
            Ck(a, d);
          else {
            e = a.current.alternate;
            if (0 === (d & 30) && !Ok(e) && (b = Ik(a, d), 2 === b && (f = xc(a), 0 !== f && (d = f, b = Nk(a, f))), 1 === b))
              throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
            a.finishedWork = e;
            a.finishedLanes = d;
            switch (b) {
              case 0:
              case 1:
                throw Error(p(345));
              case 2:
                Pk(a, tk, uk);
                break;
              case 3:
                Ck(a, d);
                if ((d & 130023424) === d && (b = fk + 500 - B(), 10 < b)) {
                  if (0 !== uc(a, 0))
                    break;
                  e = a.suspendedLanes;
                  if ((e & d) !== d) {
                    R();
                    a.pingedLanes |= a.suspendedLanes & e;
                    break;
                  }
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), b);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 4:
                Ck(a, d);
                if ((d & 4194240) === d)
                  break;
                b = a.eventTimes;
                for (e = -1; 0 < d; ) {
                  var g = 31 - oc(d);
                  f = 1 << g;
                  g = b[g];
                  g > e && (e = g);
                  d &= ~f;
                }
                d = e;
                d = B() - d;
                d = (120 > d ? 120 : 480 > d ? 480 : 1080 > d ? 1080 : 1920 > d ? 1920 : 3e3 > d ? 3e3 : 4320 > d ? 4320 : 1960 * lk(d / 1960)) - d;
                if (10 < d) {
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), d);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 5:
                Pk(a, tk, uk);
                break;
              default:
                throw Error(p(329));
            }
          }
        }
        Dk(a, B());
        return a.callbackNode === c ? Gk.bind(null, a) : null;
      }
      function Nk(a, b) {
        var c = sk;
        a.current.memoizedState.isDehydrated && (Kk(a, b).flags |= 256);
        a = Ik(a, b);
        2 !== a && (b = tk, tk = c, null !== b && Fj(b));
        return a;
      }
      function Fj(a) {
        null === tk ? tk = a : tk.push.apply(tk, a);
      }
      function Ok(a) {
        for (var b = a; ; ) {
          if (b.flags & 16384) {
            var c = b.updateQueue;
            if (null !== c && (c = c.stores, null !== c))
              for (var d = 0; d < c.length; d++) {
                var e = c[d], f = e.getSnapshot;
                e = e.value;
                try {
                  if (!He(f(), e))
                    return false;
                } catch (g) {
                  return false;
                }
              }
          }
          c = b.child;
          if (b.subtreeFlags & 16384 && null !== c)
            c.return = b, b = c;
          else {
            if (b === a)
              break;
            for (; null === b.sibling; ) {
              if (null === b.return || b.return === a)
                return true;
              b = b.return;
            }
            b.sibling.return = b.return;
            b = b.sibling;
          }
        }
        return true;
      }
      function Ck(a, b) {
        b &= ~rk;
        b &= ~qk;
        a.suspendedLanes |= b;
        a.pingedLanes &= ~b;
        for (a = a.expirationTimes; 0 < b; ) {
          var c = 31 - oc(b), d = 1 << c;
          a[c] = -1;
          b &= ~d;
        }
      }
      function Ek(a) {
        if (0 !== (K & 6))
          throw Error(p(327));
        Hk();
        var b = uc(a, 0);
        if (0 === (b & 1))
          return Dk(a, B()), null;
        var c = Ik(a, b);
        if (0 !== a.tag && 2 === c) {
          var d = xc(a);
          0 !== d && (b = d, c = Nk(a, d));
        }
        if (1 === c)
          throw c = pk, Kk(a, 0), Ck(a, b), Dk(a, B()), c;
        if (6 === c)
          throw Error(p(345));
        a.finishedWork = a.current.alternate;
        a.finishedLanes = b;
        Pk(a, tk, uk);
        Dk(a, B());
        return null;
      }
      function Qk(a, b) {
        var c = K;
        K |= 1;
        try {
          return a(b);
        } finally {
          K = c, 0 === K && (Gj = B() + 500, fg && jg());
        }
      }
      function Rk(a) {
        null !== wk && 0 === wk.tag && 0 === (K & 6) && Hk();
        var b = K;
        K |= 1;
        var c = ok.transition, d = C;
        try {
          if (ok.transition = null, C = 1, a)
            return a();
        } finally {
          C = d, ok.transition = c, K = b, 0 === (K & 6) && jg();
        }
      }
      function Hj() {
        fj = ej.current;
        E(ej);
      }
      function Kk(a, b) {
        a.finishedWork = null;
        a.finishedLanes = 0;
        var c = a.timeoutHandle;
        -1 !== c && (a.timeoutHandle = -1, Gf(c));
        if (null !== Y)
          for (c = Y.return; null !== c; ) {
            var d = c;
            wg(d);
            switch (d.tag) {
              case 1:
                d = d.type.childContextTypes;
                null !== d && void 0 !== d && $f();
                break;
              case 3:
                zh();
                E(Wf);
                E(H);
                Eh();
                break;
              case 5:
                Bh(d);
                break;
              case 4:
                zh();
                break;
              case 13:
                E(L);
                break;
              case 19:
                E(L);
                break;
              case 10:
                ah(d.type._context);
                break;
              case 22:
              case 23:
                Hj();
            }
            c = c.return;
          }
        Q = a;
        Y = a = Pg(a.current, null);
        Z = fj = b;
        T = 0;
        pk = null;
        rk = qk = rh = 0;
        tk = sk = null;
        if (null !== fh) {
          for (b = 0; b < fh.length; b++)
            if (c = fh[b], d = c.interleaved, null !== d) {
              c.interleaved = null;
              var e = d.next, f = c.pending;
              if (null !== f) {
                var g = f.next;
                f.next = e;
                d.next = g;
              }
              c.pending = d;
            }
          fh = null;
        }
        return a;
      }
      function Mk(a, b) {
        do {
          var c = Y;
          try {
            $g();
            Fh.current = Rh;
            if (Ih) {
              for (var d = M.memoizedState; null !== d; ) {
                var e = d.queue;
                null !== e && (e.pending = null);
                d = d.next;
              }
              Ih = false;
            }
            Hh = 0;
            O = N = M = null;
            Jh = false;
            Kh = 0;
            nk.current = null;
            if (null === c || null === c.return) {
              T = 1;
              pk = b;
              Y = null;
              break;
            }
            a: {
              var f = a, g = c.return, h = c, k = b;
              b = Z;
              h.flags |= 32768;
              if (null !== k && "object" === typeof k && "function" === typeof k.then) {
                var l = k, m = h, q = m.tag;
                if (0 === (m.mode & 1) && (0 === q || 11 === q || 15 === q)) {
                  var r = m.alternate;
                  r ? (m.updateQueue = r.updateQueue, m.memoizedState = r.memoizedState, m.lanes = r.lanes) : (m.updateQueue = null, m.memoizedState = null);
                }
                var y = Ui(g);
                if (null !== y) {
                  y.flags &= -257;
                  Vi(y, g, h, f, b);
                  y.mode & 1 && Si(f, l, b);
                  b = y;
                  k = l;
                  var n = b.updateQueue;
                  if (null === n) {
                    var t = /* @__PURE__ */ new Set();
                    t.add(k);
                    b.updateQueue = t;
                  } else
                    n.add(k);
                  break a;
                } else {
                  if (0 === (b & 1)) {
                    Si(f, l, b);
                    tj();
                    break a;
                  }
                  k = Error(p(426));
                }
              } else if (I && h.mode & 1) {
                var J = Ui(g);
                if (null !== J) {
                  0 === (J.flags & 65536) && (J.flags |= 256);
                  Vi(J, g, h, f, b);
                  Jg(Ji(k, h));
                  break a;
                }
              }
              f = k = Ji(k, h);
              4 !== T && (T = 2);
              null === sk ? sk = [f] : sk.push(f);
              f = g;
              do {
                switch (f.tag) {
                  case 3:
                    f.flags |= 65536;
                    b &= -b;
                    f.lanes |= b;
                    var x = Ni(f, k, b);
                    ph(f, x);
                    break a;
                  case 1:
                    h = k;
                    var w = f.type, u = f.stateNode;
                    if (0 === (f.flags & 128) && ("function" === typeof w.getDerivedStateFromError || null !== u && "function" === typeof u.componentDidCatch && (null === Ri || !Ri.has(u)))) {
                      f.flags |= 65536;
                      b &= -b;
                      f.lanes |= b;
                      var F = Qi(f, h, b);
                      ph(f, F);
                      break a;
                    }
                }
                f = f.return;
              } while (null !== f);
            }
            Sk(c);
          } catch (na) {
            b = na;
            Y === c && null !== c && (Y = c = c.return);
            continue;
          }
          break;
        } while (1);
      }
      function Jk() {
        var a = mk.current;
        mk.current = Rh;
        return null === a ? Rh : a;
      }
      function tj() {
        if (0 === T || 3 === T || 2 === T)
          T = 4;
        null === Q || 0 === (rh & 268435455) && 0 === (qk & 268435455) || Ck(Q, Z);
      }
      function Ik(a, b) {
        var c = K;
        K |= 2;
        var d = Jk();
        if (Q !== a || Z !== b)
          uk = null, Kk(a, b);
        do
          try {
            Tk();
            break;
          } catch (e) {
            Mk(a, e);
          }
        while (1);
        $g();
        K = c;
        mk.current = d;
        if (null !== Y)
          throw Error(p(261));
        Q = null;
        Z = 0;
        return T;
      }
      function Tk() {
        for (; null !== Y; )
          Uk(Y);
      }
      function Lk() {
        for (; null !== Y && !cc(); )
          Uk(Y);
      }
      function Uk(a) {
        var b = Vk(a.alternate, a, fj);
        a.memoizedProps = a.pendingProps;
        null === b ? Sk(a) : Y = b;
        nk.current = null;
      }
      function Sk(a) {
        var b = a;
        do {
          var c = b.alternate;
          a = b.return;
          if (0 === (b.flags & 32768)) {
            if (c = Ej(c, b, fj), null !== c) {
              Y = c;
              return;
            }
          } else {
            c = Ij(c, b);
            if (null !== c) {
              c.flags &= 32767;
              Y = c;
              return;
            }
            if (null !== a)
              a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null;
            else {
              T = 6;
              Y = null;
              return;
            }
          }
          b = b.sibling;
          if (null !== b) {
            Y = b;
            return;
          }
          Y = b = a;
        } while (null !== b);
        0 === T && (T = 5);
      }
      function Pk(a, b, c) {
        var d = C, e = ok.transition;
        try {
          ok.transition = null, C = 1, Wk(a, b, c, d);
        } finally {
          ok.transition = e, C = d;
        }
        return null;
      }
      function Wk(a, b, c, d) {
        do
          Hk();
        while (null !== wk);
        if (0 !== (K & 6))
          throw Error(p(327));
        c = a.finishedWork;
        var e = a.finishedLanes;
        if (null === c)
          return null;
        a.finishedWork = null;
        a.finishedLanes = 0;
        if (c === a.current)
          throw Error(p(177));
        a.callbackNode = null;
        a.callbackPriority = 0;
        var f = c.lanes | c.childLanes;
        Bc(a, f);
        a === Q && (Y = Q = null, Z = 0);
        0 === (c.subtreeFlags & 2064) && 0 === (c.flags & 2064) || vk || (vk = true, Fk(hc, function() {
          Hk();
          return null;
        }));
        f = 0 !== (c.flags & 15990);
        if (0 !== (c.subtreeFlags & 15990) || f) {
          f = ok.transition;
          ok.transition = null;
          var g = C;
          C = 1;
          var h = K;
          K |= 4;
          nk.current = null;
          Oj(a, c);
          dk(c, a);
          Oe(Df);
          dd = !!Cf;
          Df = Cf = null;
          a.current = c;
          hk(c, a, e);
          dc();
          K = h;
          C = g;
          ok.transition = f;
        } else
          a.current = c;
        vk && (vk = false, wk = a, xk = e);
        f = a.pendingLanes;
        0 === f && (Ri = null);
        mc(c.stateNode, d);
        Dk(a, B());
        if (null !== b)
          for (d = a.onRecoverableError, c = 0; c < b.length; c++)
            e = b[c], d(e.value, { componentStack: e.stack, digest: e.digest });
        if (Oi)
          throw Oi = false, a = Pi, Pi = null, a;
        0 !== (xk & 1) && 0 !== a.tag && Hk();
        f = a.pendingLanes;
        0 !== (f & 1) ? a === zk ? yk++ : (yk = 0, zk = a) : yk = 0;
        jg();
        return null;
      }
      function Hk() {
        if (null !== wk) {
          var a = Dc(xk), b = ok.transition, c = C;
          try {
            ok.transition = null;
            C = 16 > a ? 16 : a;
            if (null === wk)
              var d = false;
            else {
              a = wk;
              wk = null;
              xk = 0;
              if (0 !== (K & 6))
                throw Error(p(331));
              var e = K;
              K |= 4;
              for (V = a.current; null !== V; ) {
                var f = V, g = f.child;
                if (0 !== (V.flags & 16)) {
                  var h = f.deletions;
                  if (null !== h) {
                    for (var k = 0; k < h.length; k++) {
                      var l = h[k];
                      for (V = l; null !== V; ) {
                        var m = V;
                        switch (m.tag) {
                          case 0:
                          case 11:
                          case 15:
                            Pj(8, m, f);
                        }
                        var q = m.child;
                        if (null !== q)
                          q.return = m, V = q;
                        else
                          for (; null !== V; ) {
                            m = V;
                            var r = m.sibling, y = m.return;
                            Sj(m);
                            if (m === l) {
                              V = null;
                              break;
                            }
                            if (null !== r) {
                              r.return = y;
                              V = r;
                              break;
                            }
                            V = y;
                          }
                      }
                    }
                    var n = f.alternate;
                    if (null !== n) {
                      var t = n.child;
                      if (null !== t) {
                        n.child = null;
                        do {
                          var J = t.sibling;
                          t.sibling = null;
                          t = J;
                        } while (null !== t);
                      }
                    }
                    V = f;
                  }
                }
                if (0 !== (f.subtreeFlags & 2064) && null !== g)
                  g.return = f, V = g;
                else
                  b:
                    for (; null !== V; ) {
                      f = V;
                      if (0 !== (f.flags & 2048))
                        switch (f.tag) {
                          case 0:
                          case 11:
                          case 15:
                            Pj(9, f, f.return);
                        }
                      var x = f.sibling;
                      if (null !== x) {
                        x.return = f.return;
                        V = x;
                        break b;
                      }
                      V = f.return;
                    }
              }
              var w = a.current;
              for (V = w; null !== V; ) {
                g = V;
                var u = g.child;
                if (0 !== (g.subtreeFlags & 2064) && null !== u)
                  u.return = g, V = u;
                else
                  b:
                    for (g = w; null !== V; ) {
                      h = V;
                      if (0 !== (h.flags & 2048))
                        try {
                          switch (h.tag) {
                            case 0:
                            case 11:
                            case 15:
                              Qj(9, h);
                          }
                        } catch (na) {
                          W(h, h.return, na);
                        }
                      if (h === g) {
                        V = null;
                        break b;
                      }
                      var F = h.sibling;
                      if (null !== F) {
                        F.return = h.return;
                        V = F;
                        break b;
                      }
                      V = h.return;
                    }
              }
              K = e;
              jg();
              if (lc && "function" === typeof lc.onPostCommitFiberRoot)
                try {
                  lc.onPostCommitFiberRoot(kc, a);
                } catch (na) {
                }
              d = true;
            }
            return d;
          } finally {
            C = c, ok.transition = b;
          }
        }
        return false;
      }
      function Xk(a, b, c) {
        b = Ji(c, b);
        b = Ni(a, b, 1);
        a = nh(a, b, 1);
        b = R();
        null !== a && (Ac(a, 1, b), Dk(a, b));
      }
      function W(a, b, c) {
        if (3 === a.tag)
          Xk(a, a, c);
        else
          for (; null !== b; ) {
            if (3 === b.tag) {
              Xk(b, a, c);
              break;
            } else if (1 === b.tag) {
              var d = b.stateNode;
              if ("function" === typeof b.type.getDerivedStateFromError || "function" === typeof d.componentDidCatch && (null === Ri || !Ri.has(d))) {
                a = Ji(c, a);
                a = Qi(b, a, 1);
                b = nh(b, a, 1);
                a = R();
                null !== b && (Ac(b, 1, a), Dk(b, a));
                break;
              }
            }
            b = b.return;
          }
      }
      function Ti(a, b, c) {
        var d = a.pingCache;
        null !== d && d.delete(b);
        b = R();
        a.pingedLanes |= a.suspendedLanes & c;
        Q === a && (Z & c) === c && (4 === T || 3 === T && (Z & 130023424) === Z && 500 > B() - fk ? Kk(a, 0) : rk |= c);
        Dk(a, b);
      }
      function Yk(a, b) {
        0 === b && (0 === (a.mode & 1) ? b = 1 : (b = sc, sc <<= 1, 0 === (sc & 130023424) && (sc = 4194304)));
        var c = R();
        a = ih(a, b);
        null !== a && (Ac(a, b, c), Dk(a, c));
      }
      function uj(a) {
        var b = a.memoizedState, c = 0;
        null !== b && (c = b.retryLane);
        Yk(a, c);
      }
      function bk(a, b) {
        var c = 0;
        switch (a.tag) {
          case 13:
            var d = a.stateNode;
            var e = a.memoizedState;
            null !== e && (c = e.retryLane);
            break;
          case 19:
            d = a.stateNode;
            break;
          default:
            throw Error(p(314));
        }
        null !== d && d.delete(b);
        Yk(a, c);
      }
      var Vk;
      Vk = function(a, b, c) {
        if (null !== a)
          if (a.memoizedProps !== b.pendingProps || Wf.current)
            dh = true;
          else {
            if (0 === (a.lanes & c) && 0 === (b.flags & 128))
              return dh = false, yj(a, b, c);
            dh = 0 !== (a.flags & 131072) ? true : false;
          }
        else
          dh = false, I && 0 !== (b.flags & 1048576) && ug(b, ng, b.index);
        b.lanes = 0;
        switch (b.tag) {
          case 2:
            var d = b.type;
            ij(a, b);
            a = b.pendingProps;
            var e = Yf(b, H.current);
            ch(b, c);
            e = Nh(null, b, d, a, e, c);
            var f = Sh();
            b.flags |= 1;
            "object" === typeof e && null !== e && "function" === typeof e.render && void 0 === e.$$typeof ? (b.tag = 1, b.memoizedState = null, b.updateQueue = null, Zf(d) ? (f = true, cg(b)) : f = false, b.memoizedState = null !== e.state && void 0 !== e.state ? e.state : null, kh(b), e.updater = Ei, b.stateNode = e, e._reactInternals = b, Ii(b, d, a, c), b = jj(null, b, d, true, f, c)) : (b.tag = 0, I && f && vg(b), Xi(null, b, e, c), b = b.child);
            return b;
          case 16:
            d = b.elementType;
            a: {
              ij(a, b);
              a = b.pendingProps;
              e = d._init;
              d = e(d._payload);
              b.type = d;
              e = b.tag = Zk(d);
              a = Ci(d, a);
              switch (e) {
                case 0:
                  b = cj(null, b, d, a, c);
                  break a;
                case 1:
                  b = hj(null, b, d, a, c);
                  break a;
                case 11:
                  b = Yi(null, b, d, a, c);
                  break a;
                case 14:
                  b = $i(null, b, d, Ci(d.type, a), c);
                  break a;
              }
              throw Error(p(
                306,
                d,
                ""
              ));
            }
            return b;
          case 0:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), cj(a, b, d, e, c);
          case 1:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), hj(a, b, d, e, c);
          case 3:
            a: {
              kj(b);
              if (null === a)
                throw Error(p(387));
              d = b.pendingProps;
              f = b.memoizedState;
              e = f.element;
              lh(a, b);
              qh(b, d, null, c);
              var g = b.memoizedState;
              d = g.element;
              if (f.isDehydrated)
                if (f = { element: d, isDehydrated: false, cache: g.cache, pendingSuspenseBoundaries: g.pendingSuspenseBoundaries, transitions: g.transitions }, b.updateQueue.baseState = f, b.memoizedState = f, b.flags & 256) {
                  e = Ji(Error(p(423)), b);
                  b = lj(a, b, d, c, e);
                  break a;
                } else if (d !== e) {
                  e = Ji(Error(p(424)), b);
                  b = lj(a, b, d, c, e);
                  break a;
                } else
                  for (yg = Lf(b.stateNode.containerInfo.firstChild), xg = b, I = true, zg = null, c = Vg(b, null, d, c), b.child = c; c; )
                    c.flags = c.flags & -3 | 4096, c = c.sibling;
              else {
                Ig();
                if (d === e) {
                  b = Zi(a, b, c);
                  break a;
                }
                Xi(a, b, d, c);
              }
              b = b.child;
            }
            return b;
          case 5:
            return Ah(b), null === a && Eg(b), d = b.type, e = b.pendingProps, f = null !== a ? a.memoizedProps : null, g = e.children, Ef(d, e) ? g = null : null !== f && Ef(d, f) && (b.flags |= 32), gj(a, b), Xi(a, b, g, c), b.child;
          case 6:
            return null === a && Eg(b), null;
          case 13:
            return oj(a, b, c);
          case 4:
            return yh(b, b.stateNode.containerInfo), d = b.pendingProps, null === a ? b.child = Ug(b, null, d, c) : Xi(a, b, d, c), b.child;
          case 11:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), Yi(a, b, d, e, c);
          case 7:
            return Xi(a, b, b.pendingProps, c), b.child;
          case 8:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 12:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 10:
            a: {
              d = b.type._context;
              e = b.pendingProps;
              f = b.memoizedProps;
              g = e.value;
              G(Wg, d._currentValue);
              d._currentValue = g;
              if (null !== f)
                if (He(f.value, g)) {
                  if (f.children === e.children && !Wf.current) {
                    b = Zi(a, b, c);
                    break a;
                  }
                } else
                  for (f = b.child, null !== f && (f.return = b); null !== f; ) {
                    var h = f.dependencies;
                    if (null !== h) {
                      g = f.child;
                      for (var k = h.firstContext; null !== k; ) {
                        if (k.context === d) {
                          if (1 === f.tag) {
                            k = mh(-1, c & -c);
                            k.tag = 2;
                            var l = f.updateQueue;
                            if (null !== l) {
                              l = l.shared;
                              var m = l.pending;
                              null === m ? k.next = k : (k.next = m.next, m.next = k);
                              l.pending = k;
                            }
                          }
                          f.lanes |= c;
                          k = f.alternate;
                          null !== k && (k.lanes |= c);
                          bh(
                            f.return,
                            c,
                            b
                          );
                          h.lanes |= c;
                          break;
                        }
                        k = k.next;
                      }
                    } else if (10 === f.tag)
                      g = f.type === b.type ? null : f.child;
                    else if (18 === f.tag) {
                      g = f.return;
                      if (null === g)
                        throw Error(p(341));
                      g.lanes |= c;
                      h = g.alternate;
                      null !== h && (h.lanes |= c);
                      bh(g, c, b);
                      g = f.sibling;
                    } else
                      g = f.child;
                    if (null !== g)
                      g.return = f;
                    else
                      for (g = f; null !== g; ) {
                        if (g === b) {
                          g = null;
                          break;
                        }
                        f = g.sibling;
                        if (null !== f) {
                          f.return = g.return;
                          g = f;
                          break;
                        }
                        g = g.return;
                      }
                    f = g;
                  }
              Xi(a, b, e.children, c);
              b = b.child;
            }
            return b;
          case 9:
            return e = b.type, d = b.pendingProps.children, ch(b, c), e = eh(e), d = d(e), b.flags |= 1, Xi(a, b, d, c), b.child;
          case 14:
            return d = b.type, e = Ci(d, b.pendingProps), e = Ci(d.type, e), $i(a, b, d, e, c);
          case 15:
            return bj(a, b, b.type, b.pendingProps, c);
          case 17:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), ij(a, b), b.tag = 1, Zf(d) ? (a = true, cg(b)) : a = false, ch(b, c), Gi(b, d, e), Ii(b, d, e, c), jj(null, b, d, true, a, c);
          case 19:
            return xj(a, b, c);
          case 22:
            return dj(a, b, c);
        }
        throw Error(p(156, b.tag));
      };
      function Fk(a, b) {
        return ac(a, b);
      }
      function $k(a, b, c, d) {
        this.tag = a;
        this.key = c;
        this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
        this.index = 0;
        this.ref = null;
        this.pendingProps = b;
        this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
        this.mode = d;
        this.subtreeFlags = this.flags = 0;
        this.deletions = null;
        this.childLanes = this.lanes = 0;
        this.alternate = null;
      }
      function Bg(a, b, c, d) {
        return new $k(a, b, c, d);
      }
      function aj(a) {
        a = a.prototype;
        return !(!a || !a.isReactComponent);
      }
      function Zk(a) {
        if ("function" === typeof a)
          return aj(a) ? 1 : 0;
        if (void 0 !== a && null !== a) {
          a = a.$$typeof;
          if (a === Da)
            return 11;
          if (a === Ga)
            return 14;
        }
        return 2;
      }
      function Pg(a, b) {
        var c = a.alternate;
        null === c ? (c = Bg(a.tag, b, a.key, a.mode), c.elementType = a.elementType, c.type = a.type, c.stateNode = a.stateNode, c.alternate = a, a.alternate = c) : (c.pendingProps = b, c.type = a.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null);
        c.flags = a.flags & 14680064;
        c.childLanes = a.childLanes;
        c.lanes = a.lanes;
        c.child = a.child;
        c.memoizedProps = a.memoizedProps;
        c.memoizedState = a.memoizedState;
        c.updateQueue = a.updateQueue;
        b = a.dependencies;
        c.dependencies = null === b ? null : { lanes: b.lanes, firstContext: b.firstContext };
        c.sibling = a.sibling;
        c.index = a.index;
        c.ref = a.ref;
        return c;
      }
      function Rg(a, b, c, d, e, f) {
        var g = 2;
        d = a;
        if ("function" === typeof a)
          aj(a) && (g = 1);
        else if ("string" === typeof a)
          g = 5;
        else
          a:
            switch (a) {
              case ya:
                return Tg(c.children, e, f, b);
              case za:
                g = 8;
                e |= 8;
                break;
              case Aa:
                return a = Bg(12, c, b, e | 2), a.elementType = Aa, a.lanes = f, a;
              case Ea:
                return a = Bg(13, c, b, e), a.elementType = Ea, a.lanes = f, a;
              case Fa:
                return a = Bg(19, c, b, e), a.elementType = Fa, a.lanes = f, a;
              case Ia:
                return pj(c, e, f, b);
              default:
                if ("object" === typeof a && null !== a)
                  switch (a.$$typeof) {
                    case Ba:
                      g = 10;
                      break a;
                    case Ca:
                      g = 9;
                      break a;
                    case Da:
                      g = 11;
                      break a;
                    case Ga:
                      g = 14;
                      break a;
                    case Ha:
                      g = 16;
                      d = null;
                      break a;
                  }
                throw Error(p(130, null == a ? a : typeof a, ""));
            }
        b = Bg(g, c, b, e);
        b.elementType = a;
        b.type = d;
        b.lanes = f;
        return b;
      }
      function Tg(a, b, c, d) {
        a = Bg(7, a, d, b);
        a.lanes = c;
        return a;
      }
      function pj(a, b, c, d) {
        a = Bg(22, a, d, b);
        a.elementType = Ia;
        a.lanes = c;
        a.stateNode = { isHidden: false };
        return a;
      }
      function Qg(a, b, c) {
        a = Bg(6, a, null, b);
        a.lanes = c;
        return a;
      }
      function Sg(a, b, c) {
        b = Bg(4, null !== a.children ? a.children : [], a.key, b);
        b.lanes = c;
        b.stateNode = { containerInfo: a.containerInfo, pendingChildren: null, implementation: a.implementation };
        return b;
      }
      function al(a, b, c, d, e) {
        this.tag = b;
        this.containerInfo = a;
        this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
        this.timeoutHandle = -1;
        this.callbackNode = this.pendingContext = this.context = null;
        this.callbackPriority = 0;
        this.eventTimes = zc(0);
        this.expirationTimes = zc(-1);
        this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
        this.entanglements = zc(0);
        this.identifierPrefix = d;
        this.onRecoverableError = e;
        this.mutableSourceEagerHydrationData = null;
      }
      function bl(a, b, c, d, e, f, g, h, k) {
        a = new al(a, b, c, h, k);
        1 === b ? (b = 1, true === f && (b |= 8)) : b = 0;
        f = Bg(3, null, null, b);
        a.current = f;
        f.stateNode = a;
        f.memoizedState = { element: d, isDehydrated: c, cache: null, transitions: null, pendingSuspenseBoundaries: null };
        kh(f);
        return a;
      }
      function cl(a, b, c) {
        var d = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
        return { $$typeof: wa, key: null == d ? null : "" + d, children: a, containerInfo: b, implementation: c };
      }
      function dl(a) {
        if (!a)
          return Vf;
        a = a._reactInternals;
        a: {
          if (Vb(a) !== a || 1 !== a.tag)
            throw Error(p(170));
          var b = a;
          do {
            switch (b.tag) {
              case 3:
                b = b.stateNode.context;
                break a;
              case 1:
                if (Zf(b.type)) {
                  b = b.stateNode.__reactInternalMemoizedMergedChildContext;
                  break a;
                }
            }
            b = b.return;
          } while (null !== b);
          throw Error(p(171));
        }
        if (1 === a.tag) {
          var c = a.type;
          if (Zf(c))
            return bg(a, c, b);
        }
        return b;
      }
      function el(a, b, c, d, e, f, g, h, k) {
        a = bl(c, d, true, a, e, f, g, h, k);
        a.context = dl(null);
        c = a.current;
        d = R();
        e = yi(c);
        f = mh(d, e);
        f.callback = void 0 !== b && null !== b ? b : null;
        nh(c, f, e);
        a.current.lanes = e;
        Ac(a, e, d);
        Dk(a, d);
        return a;
      }
      function fl(a, b, c, d) {
        var e = b.current, f = R(), g = yi(e);
        c = dl(c);
        null === b.context ? b.context = c : b.pendingContext = c;
        b = mh(f, g);
        b.payload = { element: a };
        d = void 0 === d ? null : d;
        null !== d && (b.callback = d);
        a = nh(e, b, g);
        null !== a && (gi(a, e, g, f), oh(a, e, g));
        return g;
      }
      function gl(a) {
        a = a.current;
        if (!a.child)
          return null;
        switch (a.child.tag) {
          case 5:
            return a.child.stateNode;
          default:
            return a.child.stateNode;
        }
      }
      function hl(a, b) {
        a = a.memoizedState;
        if (null !== a && null !== a.dehydrated) {
          var c = a.retryLane;
          a.retryLane = 0 !== c && c < b ? c : b;
        }
      }
      function il(a, b) {
        hl(a, b);
        (a = a.alternate) && hl(a, b);
      }
      function jl() {
        return null;
      }
      var kl = "function" === typeof reportError ? reportError : function(a) {
        console.error(a);
      };
      function ll(a) {
        this._internalRoot = a;
      }
      ml.prototype.render = ll.prototype.render = function(a) {
        var b = this._internalRoot;
        if (null === b)
          throw Error(p(409));
        fl(a, b, null, null);
      };
      ml.prototype.unmount = ll.prototype.unmount = function() {
        var a = this._internalRoot;
        if (null !== a) {
          this._internalRoot = null;
          var b = a.containerInfo;
          Rk(function() {
            fl(null, a, null, null);
          });
          b[uf] = null;
        }
      };
      function ml(a) {
        this._internalRoot = a;
      }
      ml.prototype.unstable_scheduleHydration = function(a) {
        if (a) {
          var b = Hc();
          a = { blockedOn: null, target: a, priority: b };
          for (var c = 0; c < Qc.length && 0 !== b && b < Qc[c].priority; c++)
            ;
          Qc.splice(c, 0, a);
          0 === c && Vc(a);
        }
      };
      function nl(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType);
      }
      function ol(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType && (8 !== a.nodeType || " react-mount-point-unstable " !== a.nodeValue));
      }
      function pl() {
      }
      function ql(a, b, c, d, e) {
        if (e) {
          if ("function" === typeof d) {
            var f = d;
            d = function() {
              var a2 = gl(g);
              f.call(a2);
            };
          }
          var g = el(b, d, a, 0, null, false, false, "", pl);
          a._reactRootContainer = g;
          a[uf] = g.current;
          sf(8 === a.nodeType ? a.parentNode : a);
          Rk();
          return g;
        }
        for (; e = a.lastChild; )
          a.removeChild(e);
        if ("function" === typeof d) {
          var h = d;
          d = function() {
            var a2 = gl(k);
            h.call(a2);
          };
        }
        var k = bl(a, 0, false, null, null, false, false, "", pl);
        a._reactRootContainer = k;
        a[uf] = k.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        Rk(function() {
          fl(b, k, c, d);
        });
        return k;
      }
      function rl(a, b, c, d, e) {
        var f = c._reactRootContainer;
        if (f) {
          var g = f;
          if ("function" === typeof e) {
            var h = e;
            e = function() {
              var a2 = gl(g);
              h.call(a2);
            };
          }
          fl(b, g, a, e);
        } else
          g = ql(c, b, a, e, d);
        return gl(g);
      }
      Ec = function(a) {
        switch (a.tag) {
          case 3:
            var b = a.stateNode;
            if (b.current.memoizedState.isDehydrated) {
              var c = tc(b.pendingLanes);
              0 !== c && (Cc(b, c | 1), Dk(b, B()), 0 === (K & 6) && (Gj = B() + 500, jg()));
            }
            break;
          case 13:
            Rk(function() {
              var b2 = ih(a, 1);
              if (null !== b2) {
                var c2 = R();
                gi(b2, a, 1, c2);
              }
            }), il(a, 1);
        }
      };
      Fc = function(a) {
        if (13 === a.tag) {
          var b = ih(a, 134217728);
          if (null !== b) {
            var c = R();
            gi(b, a, 134217728, c);
          }
          il(a, 134217728);
        }
      };
      Gc = function(a) {
        if (13 === a.tag) {
          var b = yi(a), c = ih(a, b);
          if (null !== c) {
            var d = R();
            gi(c, a, b, d);
          }
          il(a, b);
        }
      };
      Hc = function() {
        return C;
      };
      Ic = function(a, b) {
        var c = C;
        try {
          return C = a, b();
        } finally {
          C = c;
        }
      };
      yb = function(a, b, c) {
        switch (b) {
          case "input":
            bb(a, c);
            b = c.name;
            if ("radio" === c.type && null != b) {
              for (c = a; c.parentNode; )
                c = c.parentNode;
              c = c.querySelectorAll("input[name=" + JSON.stringify("" + b) + '][type="radio"]');
              for (b = 0; b < c.length; b++) {
                var d = c[b];
                if (d !== a && d.form === a.form) {
                  var e = Db(d);
                  if (!e)
                    throw Error(p(90));
                  Wa(d);
                  bb(d, e);
                }
              }
            }
            break;
          case "textarea":
            ib(a, c);
            break;
          case "select":
            b = c.value, null != b && fb(a, !!c.multiple, b, false);
        }
      };
      Gb = Qk;
      Hb = Rk;
      var sl = { usingClientEntryPoint: false, Events: [Cb, ue, Db, Eb, Fb, Qk] };
      var tl = { findFiberByHostInstance: Wc, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" };
      var ul = { bundleType: tl.bundleType, version: tl.version, rendererPackageName: tl.rendererPackageName, rendererConfig: tl.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: ua.ReactCurrentDispatcher, findHostInstanceByFiber: function(a) {
        a = Zb(a);
        return null === a ? null : a.stateNode;
      }, findFiberByHostInstance: tl.findFiberByHostInstance || jl, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
      if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
        vl = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!vl.isDisabled && vl.supportsFiber)
          try {
            kc = vl.inject(ul), lc = vl;
          } catch (a) {
          }
      }
      var vl;
      exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = sl;
      exports.createPortal = function(a, b) {
        var c = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
        if (!nl(b))
          throw Error(p(200));
        return cl(a, b, null, c);
      };
      exports.createRoot = function(a, b) {
        if (!nl(a))
          throw Error(p(299));
        var c = false, d = "", e = kl;
        null !== b && void 0 !== b && (true === b.unstable_strictMode && (c = true), void 0 !== b.identifierPrefix && (d = b.identifierPrefix), void 0 !== b.onRecoverableError && (e = b.onRecoverableError));
        b = bl(a, 1, false, null, null, c, false, d, e);
        a[uf] = b.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        return new ll(b);
      };
      exports.findDOMNode = function(a) {
        if (null == a)
          return null;
        if (1 === a.nodeType)
          return a;
        var b = a._reactInternals;
        if (void 0 === b) {
          if ("function" === typeof a.render)
            throw Error(p(188));
          a = Object.keys(a).join(",");
          throw Error(p(268, a));
        }
        a = Zb(b);
        a = null === a ? null : a.stateNode;
        return a;
      };
      exports.flushSync = function(a) {
        return Rk(a);
      };
      exports.hydrate = function(a, b, c) {
        if (!ol(b))
          throw Error(p(200));
        return rl(null, a, b, true, c);
      };
      exports.hydrateRoot = function(a, b, c) {
        if (!nl(a))
          throw Error(p(405));
        var d = null != c && c.hydratedSources || null, e = false, f = "", g = kl;
        null !== c && void 0 !== c && (true === c.unstable_strictMode && (e = true), void 0 !== c.identifierPrefix && (f = c.identifierPrefix), void 0 !== c.onRecoverableError && (g = c.onRecoverableError));
        b = el(b, null, a, 1, null != c ? c : null, e, false, f, g);
        a[uf] = b.current;
        sf(a);
        if (d)
          for (a = 0; a < d.length; a++)
            c = d[a], e = c._getVersion, e = e(c._source), null == b.mutableSourceEagerHydrationData ? b.mutableSourceEagerHydrationData = [c, e] : b.mutableSourceEagerHydrationData.push(
              c,
              e
            );
        return new ml(b);
      };
      exports.render = function(a, b, c) {
        if (!ol(b))
          throw Error(p(200));
        return rl(null, a, b, false, c);
      };
      exports.unmountComponentAtNode = function(a) {
        if (!ol(a))
          throw Error(p(40));
        return a._reactRootContainer ? (Rk(function() {
          rl(null, null, a, false, function() {
            a._reactRootContainer = null;
            a[uf] = null;
          });
        }), true) : false;
      };
      exports.unstable_batchedUpdates = Qk;
      exports.unstable_renderSubtreeIntoContainer = function(a, b, c, d) {
        if (!ol(c))
          throw Error(p(200));
        if (null == a || void 0 === a._reactInternals)
          throw Error(p(38));
        return rl(a, b, c, false, d);
      };
      exports.version = "18.3.1-next-f1338f8080-20240426";
    }
  });

  // ../node_modules/react-dom/index.js
  var require_react_dom = __commonJS({
    "../node_modules/react-dom/index.js"(exports, module) {
      "use strict";
      function checkDCE() {
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
          return;
        }
        if (false) {
          throw new Error("^_^");
        }
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
        } catch (err) {
          console.error(err);
        }
      }
      if (true) {
        checkDCE();
        module.exports = require_react_dom_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // ../node_modules/react-dom/client.js
  var require_client = __commonJS({
    "../node_modules/react-dom/client.js"(exports) {
      "use strict";
      var m = require_react_dom();
      if (true) {
        exports.createRoot = m.createRoot;
        exports.hydrateRoot = m.hydrateRoot;
      } else {
        i = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        exports.createRoot = function(c, o) {
          i.usingClientEntryPoint = true;
          try {
            return m.createRoot(c, o);
          } finally {
            i.usingClientEntryPoint = false;
          }
        };
        exports.hydrateRoot = function(c, h, o) {
          i.usingClientEntryPoint = true;
          try {
            return m.hydrateRoot(c, h, o);
          } finally {
            i.usingClientEntryPoint = false;
          }
        };
      }
      var i;
    }
  });

  // src/webview/gitApiShim.ts
  var vscode = acquireVsCodeApi();
  var nextId = 1;
  var pending = /* @__PURE__ */ new Map();
  var listeners = {
    repoChanged: [],
    workingChanged: []
  };
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object")
      return;
    if (msg.type === "gitApiResult") {
      const entry = pending.get(msg.id);
      if (!entry)
        return;
      pending.delete(msg.id);
      if (msg.ok)
        entry.resolve(msg.value);
      else
        entry.reject(new Error(msg.error ?? "gitApi error"));
      return;
    }
    if (msg.type === "event") {
      const cbs = listeners[msg.name];
      if (cbs)
        cbs.slice().forEach((cb) => {
          try {
            cb();
          } catch {
          }
        });
    }
  });
  function call(method, args) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      vscode.postMessage({ type: "gitApi", id, method, args });
    });
  }
  var overrides = {
    // Synchronous zoom no-ops (desktop returns a number synchronously)
    zoomGet: () => 1,
    zoomSet: () => 1,
    // Event subscription helpers
    onRepoChanged: (cb) => {
      listeners.repoChanged.push(cb);
    },
    onWorkingChanged: (cb) => {
      listeners.workingChanged.push(cb);
    },
    offRepoChanged: (cb) => {
      listeners.repoChanged = listeners.repoChanged.filter((f) => f !== cb);
    },
    offWorkingChanged: (cb) => {
      listeners.workingChanged = listeners.workingChanged.filter((f) => f !== cb);
    }
  };
  var gitAPI = new Proxy({}, {
    get(_target, prop) {
      if (prop in overrides)
        return overrides[prop];
      if (typeof prop !== "string")
        return void 0;
      if (/^(on|off)[A-Z]/.test(prop))
        return (_cb) => {
        };
      return (...args) => call(prop, args);
    }
  });
  window.gitAPI = gitAPI;
  window.appInfo = { platform: "vscode" };

  // src/webview/app.tsx
  var import_react10 = __toESM(require_react());
  var import_client = __toESM(require_client());

  // ../src/renderer/src/contexts/SettingsContext.tsx
  var import_react = __toESM(require_react());
  var SettingsContext = (0, import_react.createContext)(null);
  var SETTING_DEFAULTS = {
    accentColor: "#58a6ff",
    dateFormat: "relative",
    // 'relative' | 'absolute'
    graphShowAvatars: "true",
    graphShowAuthor: "true",
    graphShowDate: "true",
    graphShowSha: "true"
  };
  function applyAppearance(s) {
    const root = document.documentElement;
    const accent = s.accentColor || SETTING_DEFAULTS.accentColor;
    root.style.setProperty("--accent", accent);
  }
  function SettingsProvider({ children }) {
    const [settings, setSettings] = (0, import_react.useState)(SETTING_DEFAULTS);
    const [ready, setReady] = (0, import_react.useState)(false);
    (0, import_react.useEffect)(() => {
      window.gitAPI.settingsGetAll().then((s) => {
        const merged = { ...SETTING_DEFAULTS, ...s };
        setSettings(merged);
        applyAppearance(merged);
        setReady(true);
      }).catch(() => {
        applyAppearance(SETTING_DEFAULTS);
        setReady(true);
      });
    }, []);
    const set = (0, import_react.useCallback)((key, value) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        applyAppearance(next);
        return next;
      });
      window.gitAPI.settingsSet(key, value);
    }, []);
    const get = (0, import_react.useCallback)(
      (key, fallback = "") => settings[key] ?? fallback,
      [settings]
    );
    const getBool = (0, import_react.useCallback)(
      (key, fallback = false) => {
        const v = settings[key];
        return v === void 0 ? fallback : v === "true";
      },
      [settings]
    );
    return /* @__PURE__ */ import_react.default.createElement(SettingsContext.Provider, { value: { settings, ready, set, get, getBool } }, children);
  }
  function useSettings() {
    const ctx = (0, import_react.useContext)(SettingsContext);
    if (!ctx)
      throw new Error("useSettings must be used inside SettingsProvider");
    return ctx;
  }

  // ../src/renderer/src/i18n/LanguageContext.tsx
  var import_react2 = __toESM(require_react());

  // ../src/renderer/src/i18n/translations.ts
  var fr = {
    // Toolbar
    "toolbar.fetch.tooltip": "Fetch \u2014 r\xE9cup\xE8re les refs distants",
    "toolbar.pull.tooltip": "Pull \u2014 int\xE8gre les commits distants",
    "toolbar.push.tooltip": "Push \u2014 envoie les commits locaux (push direct si upstream configur\xE9)",
    "toolbar.pushModal.tooltip": "Choisir remote / branche upstream",
    "toolbar.newBranch.tooltip": "Nouvelle branche",
    "toolbar.allBranches.tooltip": "Afficher toutes les branches",
    "toolbar.refresh.tooltip": "Rafra\xEEchir",
    "toolbar.gitflow.tooltip": "Gitflow \u2014 feature / release / hotfix",
    "tabs.new": "Nouvel onglet",
    "tabs.close": "Fermer l'onglet",
    "tabs.closeOthers": "Fermer les autres onglets",
    "tabs.openRepo": "\u{1F4C2} Ouvrir un d\xE9p\xF4t\u2026",
    "tabs.clone": " Cloner depuis GitHub\u2026",
    "gitflow.loading": "Chargement\u2026",
    "gitflow.notInit": "Gitflow n'est pas initialis\xE9 dans ce d\xE9p\xF4t.",
    "gitflow.initBtn": 'Initialiser Gitflow (cr\xE9er "develop")',
    "gitflow.mainBranch": "Branche principale :",
    "gitflow.col.feature": "Features",
    "gitflow.col.release": "Releases",
    "gitflow.col.hotfix": "Hotfixes",
    "gitflow.none": "Aucune branche",
    "gitflow.start": "D\xE9marrer",
    "gitflow.finish": "Terminer",
    "gitflow.prompt.startName": (type) => `Nom de la ${type} :`,
    "gitflow.prompt.finish": (type, name) => `Terminer ${type}/${name} ?
(merge + suppression de la branche)`,
    "gitflow.prompt.tag": "Nom du tag (laisser vide pour ne pas taguer) :",
    "gitflow.toast.init": '\u2713 Gitflow initialis\xE9 (branche "develop" cr\xE9\xE9e)',
    "gitflow.toast.started": (type, name) => `\u2713 ${type}/${name} d\xE9marr\xE9e`,
    "gitflow.toast.finished": (type, name) => `\u2713 ${type}/${name} termin\xE9e`,
    "toolbar.fetchedNow": "fetched \xE0 l'instant",
    "toolbar.fetchedAgo": (mins) => `fetched il y a ${mins} min`,
    "statusbar.ahead": (n) => `${n} commit(s) en avance sur le remote`,
    "statusbar.behind": (n) => `${n} commit(s) en retard sur le remote`,
    "statusbar.zoomReset": "R\xE9initialiser le zoom (100%)",
    "toolbar.autoFetch.tooltip": "Auto-fetch actif (toutes les 5 min)",
    "toolbar.update.tooltip": "Une mise \xE0 jour est pr\xEAte \xE0 \xEAtre install\xE9e",
    "toolbar.update.label": "Mise \xE0 jour",
    "toolbar.settings.tooltip": "Param\xE8tres",
    "toolbar.openPR.tooltip": "Ouvrir une Pull Request sur GitHub",
    "toolbar.search.placeholder": "Rechercher commits\u2026",
    "toolbar.extSearch.tooltip": "Recherche \xE9tendue dans les diffs",
    "toolbar.undo.tooltip": "Annuler la derni\xE8re action (reset --soft)",
    "toolbar.redo.tooltip": "R\xE9tablir la derni\xE8re action annul\xE9e",
    "toolbar.stash.tooltip": "Remiser les modifications (stash)",
    "toolbar.pop.tooltip": "Appliquer et retirer le dernier stash (pop)",
    "toolbar.terminal.tooltip": "Ouvrir un terminal dans le d\xE9p\xF4t",
    // Update banner
    "update.banner": "\u{1F680} Une nouvelle version est disponible et pr\xEAte \xE0 \xEAtre install\xE9e.",
    "update.install": "Red\xE9marrer et installer",
    "update.later": "Plus tard",
    // CommitGraph
    "graph.empty": "Aucun commit \xE0 afficher",
    "graph.menu.checkout": "\u2713 Checkout (HEAD d\xE9tach\xE9)",
    "graph.menu.createBranch": "\u{1F33F} Cr\xE9er une branche ici",
    "graph.menu.interactiveRebase": "\u26A1 Interactive Rebase depuis ici",
    "graph.menu.editMessage": "\u270F\uFE0F Modifier le message du commit",
    "graph.menu.cherryPick": "\u{1F352} Cherry-pick",
    "graph.menu.revert": "\u21A9 Revert",
    "graph.menu.dropCommit": "\u{1F5D1} Supprimer ce commit (drop)",
    "graph.menu.moveUp": "\u2B06 D\xE9placer vers le haut",
    "graph.menu.moveDown": "\u2B07 D\xE9placer vers le bas",
    "graph.menu.resetSoft": "\u23EA Reset (soft) \u2014 garde les changements index\xE9s",
    "graph.menu.resetMixed": "\u23EA Reset (mixed) \u2014 garde les changements non-index\xE9s",
    "graph.menu.resetHard": "\u23EA Reset (hard) \u2014 supprime tous les changements",
    "graph.menu.createTag": "\u{1F3F7} Cr\xE9er un tag ici",
    "graph.menu.copyShortHash": "\u{1F4CB} Copier le hash court",
    "graph.menu.copyFullHash": "\u{1F4CB} Copier le hash complet",
    "graph.menu.copyMessage": "\u{1F4CB} Copier le message",
    "graph.menu.compareWorking": "\u21C4 Comparer avec le r\xE9pertoire de travail",
    "graph.drop.reset": (b, h) => `\u23EA D\xE9placer "${b}" ici (reset --hard ${h})`,
    "graph.drop.rebase": (b, h) => `\u26A1 Rebaser "${b}" sur ${h}`,
    "graph.drop.merge": (b, h) => `\u21D2 Merger ${h} dans "${b}"`,
    // PushModal
    "push.title": "\u2B06 Push",
    "push.localBranch": "Branche locale",
    "push.noRemote": "Aucun remote configur\xE9 dans ce d\xE9p\xF4t.",
    "push.remote": "Remote",
    "push.targetBranch": "Branche cible",
    "push.targetBranch.placeholder": "nom de la branche distante",
    "push.setUpstream": "D\xE9finir comme upstream (--set-upstream)",
    "push.force": "Forcer le push (--force-with-lease)",
    "push.forceWarn": "\u26A0 \xC9crase l'historique distant. Refus\xE9 si le remote a re\xE7u de nouveaux commits depuis votre dernier fetch.",
    "push.cancel": "Annuler",
    "push.pushing": "Push en cours\u2026",
    "push.button": (remote, branch) => `\u2B06 Push vers ${remote}/${branch}`,
    // RightPanel — staging
    "panel.staged": "Index\xE9",
    "panel.unstaged": "Non index\xE9",
    "panel.unstageAll": "Tout d\xE9sindexer",
    "panel.stageAll": "Tout indexer",
    "panel.refresh": "Rafra\xEEchir",
    "panel.noStaged": "Aucun fichier index\xE9",
    "panel.noChanges": "R\xE9pertoire propre \u2713",
    "panel.noUnstaged": "Aucun fichier modifi\xE9",
    "panel.amendBadge.tooltip": "Fichier du dernier commit (inclus dans l'amend)",
    "panel.folder": "(dossier)",
    "panel.stage.file": (f) => `Indexer "${f}"`,
    "panel.stage.folder": (f) => `Indexer tout le dossier "${f}"`,
    "panel.discard": "Annuler les modifications",
    "panel.discard.confirm": (path) => `Annuler les modifications de "${path}" ?
Cette action est irr\xE9versible.`,
    "panel.deleteUntracked": "Supprimer le fichier non suivi",
    "panel.deleteUntracked.confirm": (path) => `Supprimer d\xE9finitivement "${path}" du disque ?
Ce fichier n'est pas suivi par Git \u2014 il sera perdu.`,
    "panel.diff": "Diff",
    "panel.blame": "Blame",
    "panel.history": "Historique de ce fichier",
    "panel.noFiles": (n) => `${n} fichier${n !== 1 ? "s" : ""}`,
    "panel.loading": "Chargement\u2026",
    "panel.noDiff": "Aucun diff",
    "panel.close": "Fermer",
    "panel.fileHistory": (name) => `Historique \u2014 ${name}`,
    "panel.noHistory": "Aucun commit trouv\xE9",
    "panel.loadingBlame": "Chargement du blame\u2026",
    "panel.noBlame": "Aucune donn\xE9e de blame",
    "panel.copyHash": "Copier le hash",
    "panel.clickToAmend": "Cliquer pour modifier le message (amend)",
    "panel.amendConfirm": "Update Message",
    "panel.amendCancel": "Cancel Amend",
    // RightPanel — commit
    "panel.commitMsg.placeholder": "Message de commit\u2026\n\nDescription optionnelle",
    "panel.generate.tooltip": "G\xE9n\xE9rer un message de commit avec l'IA",
    "panel.commitDetails": "D\xE9tails du commit",
    "panel.stageAndCommit": "Indexer et commiter",
    "panel.commit": "Commit",
    "panel.clickCommit": "Cliquez sur un commit",
    // RightPanel — commit panel (GitKraken-style)
    "panel.discardAll": "Annuler toutes les modifications",
    "panel.discardAll.confirm": (n) => `Annuler les modifications de ${n} fichier(s) ?
Cette action est irr\xE9versible.`,
    "panel.fileChange": "modification",
    "panel.fileChanges": "modifications",
    "panel.on": "sur",
    "panel.sort": "Trier",
    "panel.view.path": "Chemin",
    "panel.view.tree": "Arbre",
    "panel.tab.commit": "Commit",
    "panel.tab.stash": "Remiser (stash)",
    "panel.tab.push": "Push",
    "panel.amendPrevious": "Amender le commit pr\xE9c\xE9dent",
    "panel.commit.summary": "R\xE9sum\xE9 du commit",
    "panel.commit.description": "Description",
    "panel.commitOptions": "Options de commit",
    "panel.composeAI": "Composer avec l'IA",
    "panel.signoff": "Ajouter Signed-off-by",
    "panel.abort": "Annuler",
    "panel.commit.inProgress": "En cours\u2026",
    "panel.commit.stageFirst": "Indexez des changements pour commiter",
    "panel.commit.typeMessage": "Saisissez un message pour commiter",
    "panel.commit.amend": "Amender le commit",
    "panel.commit.changes": (n, s) => `Commiter ${n} fichier${s}`,
    // RightPanel — errors
    "panel.gen.noKey": "Cl\xE9 API manquante \u2014 configurez-la dans Param\xE8tres \u2192 IA",
    "panel.gen.failed": (err) => `G\xE9n\xE9ration \xE9chou\xE9e : ${err}`,
    "panel.gen.empty": "Erreur : message vide re\xE7u",
    "panel.gen.unexpected": (msg) => `Erreur inattendue : ${msg}`,
    // Settings
    "settings.title": "Param\xE8tres",
    "settings.back": "Retour",
    "settings.notifications": "Notifications",
    "settings.profile": "Profil",
    "settings.defaultProfile": "Profil par d\xE9faut",
    "settings.save": "Enregistrer",
    "settings.nav.git": "\u2387 Git",
    "settings.nav.github": "\u{1F419} GitHub",
    "settings.nav.ai": "\u2728 Intelligence Artificielle",
    "settings.nav.notifications": "\u{1F514} Notifications",
    "settings.nav.about": "\u2139 \xC0 propos",
    "settings.notifications.title": "Notifications de bureau",
    "settings.notifications.desc": "Choisissez les \xE9v\xE8nements qui d\xE9clenchent une notification syst\xE8me.",
    "settings.notifications.fetch": "Nouveaux commits d\xE9tect\xE9s lors d'un fetch",
    "settings.notifications.commit": "Commit cr\xE9\xE9 avec succ\xE8s",
    "settings.notifications.update": "Mise \xE0 jour de l'application disponible",
    // Settings — Git
    "settings.git.title": "Configuration Git globale",
    "settings.git.desc": "Ces valeurs sont utilis\xE9es pour signer vos commits (git config --global).",
    "settings.git.name": "Nom",
    "settings.git.name.placeholder": "Pr\xE9nom Nom",
    "settings.git.email": "Email",
    "settings.git.email.placeholder": "vous@exemple.com",
    // Settings — GitHub
    "settings.github.title": "Connexion GitHub",
    "settings.github.desc": "Connectez votre compte GitHub pour acc\xE9der aux Pull Requests, Issues et autres fonctionnalit\xE9s collaboratives.",
    "settings.github.connected": "Connect\xE9",
    "settings.github.disconnect": "D\xE9connecter",
    "settings.github.login": "Se connecter avec GitHub",
    "settings.github.connecting": "Connexion en cours\u2026",
    // Settings — AI
    "settings.ai.title": "Fournisseur d'IA",
    "settings.ai.desc": "Choisissez le fournisseur utilis\xE9 pour la g\xE9n\xE9ration automatique de messages de commit.",
    "settings.ai.model": (p) => `Mod\xE8le \u2014 ${p}`,
    "settings.ai.modelsCount": (n) => `${n} mod\xE8les disponibles`,
    "settings.ai.custom": "(custom)",
    "settings.ai.reloadModels": "Recharger les mod\xE8les disponibles",
    "settings.ai.customPlaceholder": "ou saisir un mod\xE8le custom\u2026",
    "settings.ai.apiKey": (p) => `Cl\xE9 API \u2014 ${p}`,
    "settings.ai.show": "Afficher",
    "settings.ai.hide": "Masquer",
    "settings.ai.howToKey": "Comment obtenir une cl\xE9 API ",
    "settings.ai.tuto.anthropic": [
      "1. Cr\xE9er un compte sur console.anthropic.com",
      "2. Aller dans Settings \u2192 API Keys",
      '3. Cliquer sur "Create Key"',
      "4. Copier la cl\xE9 (elle ne sera plus visible ensuite)"
    ],
    "settings.ai.tuto.google": [
      "1. Aller sur aistudio.google.com",
      '2. Cliquer sur "Get API key" en haut \xE0 gauche',
      "3. Cr\xE9er une cl\xE9 dans un projet Google Cloud",
      "4. Copier la cl\xE9 g\xE9n\xE9r\xE9e"
    ],
    "settings.ai.tuto.groq": [
      "1. Cr\xE9er un compte sur console.groq.com",
      '2. Aller dans "API Keys" dans le menu gauche',
      '3. Cliquer sur "Create API Key"',
      "4. Copier la cl\xE9 (elle ne sera plus visible ensuite)"
    ],
    "settings.ai.tuto.openai": [
      "1. Cr\xE9er un compte sur platform.openai.com",
      '2. Aller dans "API keys" dans le menu gauche',
      '3. Cliquer sur "Create new secret key"',
      "4. Copier la cl\xE9 (elle ne sera plus visible ensuite)"
    ],
    "settings.ai.tuto.openLink": (label) => label,
    // Settings — About
    "settings.about.desc": "Interface graphique Git rapide et moderne. Visualisez vos branches, indexez vos changements et g\xE9rez vos commits simplement.",
    "settings.about.sourceCode": "Code source",
    "settings.about.releases": "Releases",
    "settings.about.reportBug": "Signaler un bug",
    "settings.about.createdBy": "Cr\xE9\xE9 par",
    "settings.about.env": "Environnement",
    "settings.about.license": "Distribu\xE9 sous licence MIT",
    "settings.about.language": "Langue",
    // Settings — Language
    "settings.lang.fr": "Fran\xE7ais",
    "settings.lang.en": "English",
    // Toasts
    "toast.fetchOk": "Fetch r\xE9ussi \u2713",
    "toast.fetchErr": (e) => `Fetch \xE9chou\xE9 : ${e}`,
    "toast.pushOk": (upstream) => `Push r\xE9ussi \u2192 ${upstream} \u2713`,
    "toast.pushErr": (e) => `Push \xE9chou\xE9 : ${e}`,
    "toast.pullOk": "Pull r\xE9ussi \u2713",
    "toast.pullErr": (e) => `Pull \xE9chou\xE9 : ${e}`,
    "toast.checkoutOk": (name) => `\u2713 Checkout "${name}"`,
    "toast.checkoutErr": (e) => `Checkout \xE9chou\xE9 : ${e}`,
    "toast.branchCreated": (name) => `\u2713 Branche "${name}" cr\xE9\xE9e`,
    "toast.branchCreatedCheckout": (name) => `\u2713 Branche "${name}" cr\xE9\xE9e + checkout`,
    "toast.branchDeleted": (name) => `Branche "${name}" supprim\xE9e`,
    "toast.branchRenamed": (name) => `\u2713 Branche renomm\xE9e en "${name}"`,
    "toast.mergeOk": (name) => `\u2713 Merge de "${name}" r\xE9ussi`,
    "toast.mergeErr": (e) => `Merge \xE9chou\xE9 : ${e}`,
    "toast.cherryPickOk": (h) => `\u2713 Cherry-pick ${h} appliqu\xE9`,
    "toast.cherryPickErr": (e) => `Cherry-pick \xE9chou\xE9 : ${e}`,
    "toast.revertOk": (h) => `\u2713 Revert ${h} appliqu\xE9`,
    "toast.revertErr": (e) => `Revert \xE9chou\xE9 : ${e}`,
    "toast.resetOk": (mode, h) => `\u2713 Reset ${mode} vers ${h}`,
    "toast.resetErr": (e) => `Reset \xE9chou\xE9 : ${e}`,
    "toast.messageEdited": "\u2713 Message du commit modifi\xE9",
    "toast.commitDropped": (h) => `\u2713 Commit ${h} supprim\xE9`,
    "toast.commitMoved": "\u2713 Commit d\xE9plac\xE9",
    "toast.rebaseOntoOk": (name) => `\u2713 Rebase sur "${name}" r\xE9ussi`,
    "toast.upstreamSet": (name) => `\u2713 Upstream d\xE9fini sur origin/${name}`,
    "toast.branchDropOk": (name) => `\u2713 "${name}" mise \xE0 jour`,
    "toast.tagCreated": (name) => `\u2713 Tag "${name}" cr\xE9\xE9`,
    "toast.tagDeleted": (name) => `Tag "${name}" supprim\xE9`,
    "toast.tagPushed": (name) => `\u2713 Tag "${name}" pouss\xE9`,
    "toast.tagDeletedRemote": (name) => `Tag distant "${name}" supprim\xE9`,
    "toast.stashCreated": "\u2713 Stash cr\xE9\xE9",
    "toast.stashErr": (e) => `Stash \xE9chou\xE9 : ${e}`,
    "toast.stashApplied": (i) => `\u2713 Stash #${i} appliqu\xE9 (gard\xE9)`,
    "toast.stashPopped": (i) => `\u2713 Stash #${i} appliqu\xE9 et supprim\xE9`,
    "toast.stashDropped": (i) => `Stash #${i} supprim\xE9`,
    "toast.rebaseContinued": "\u2713 Rebase continu\xE9 avec succ\xE8s",
    "toast.mergeContinued": "\u2713 Merge continu\xE9 avec succ\xE8s",
    "toast.rebaseAborted": "Rebase abandonn\xE9",
    "toast.commitOk": "Commit cr\xE9\xE9 \u2713",
    "toast.commitErr": (e) => `Erreur : ${e}`,
    "toast.err": (e) => `Erreur : ${e}`,
    "toast.unexpected": (e) => `Erreur inattendue : ${e}`,
    "toast.githubConnected": "Connect\xE9 \xE0 GitHub \u2713",
    "toast.githubErr": (e) => `Connexion GitHub \xE9chou\xE9e : ${e}`,
    "toast.githubDisconnected": "D\xE9connect\xE9 de GitHub",
    "toast.gitConfigSaved": "Config Git sauvegard\xE9e \u2713",
    "toast.aiSaved": "Param\xE8tres IA sauvegard\xE9s \u2713",
    "toast.applyErr": (e) => `Apply \xE9chou\xE9 : ${e}`,
    "toast.popErr": (e) => `Pop \xE9chou\xE9 : ${e}`,
    "toast.dropErr": (e) => `Drop \xE9chou\xE9 : ${e}`,
    "toast.renameErr": (e) => `Renommage \xE9chou\xE9 : ${e}`,
    "toast.deleteErr": (e) => `Erreur : ${e}`,
    // Prompts / confirms
    "prompt.newBranch": "Nom de la nouvelle branche :",
    "prompt.deleteBranch": (name) => `Supprimer la branche "${name}" ?`,
    "prompt.mergeBranch": (name, cur) => `Merger "${name}" dans "${cur}" ?`,
    "prompt.renameBranch": (name) => `Renommer "${name}" en :`,
    "prompt.checkoutNow": (name) => `Checkout sur "${name}" imm\xE9diatement ?`,
    "prompt.resetHard": (h) => `Reset hard vers ${h} ?
Tous les changements non commit\xE9s seront perdus.`,
    "prompt.editMessage": "Nouveau message du commit :",
    "prompt.dropCommit": (h) => `Supprimer le commit ${h} ?
Cela r\xE9\xE9crit l'historique via un rebase.`,
    "prompt.rebaseOnto": (cur, name) => `Rebaser "${cur}" sur "${name}" ?`,
    "prompt.deleteRemoteBranch": (name) => `Supprimer la branche distante "${name}" ?`,
    "prompt.dropReset": (b, h) => `D\xE9placer "${b}" vers ${h} (reset --hard) ?
Les commits au-del\xE0 seront perdus pour cette branche.`,
    "prompt.deleteTag": (name) => `Supprimer le tag "${name}" ?`,
    "prompt.deleteRemoteTag": (name) => `Supprimer le tag "${name}" sur le remote ? (irr\xE9versible)`,
    "prompt.tagName": "Nom du tag :",
    "prompt.tagMessage": "Message du tag (laisser vide pour un tag l\xE9ger) :",
    "prompt.stashMessage": "Message du stash (optionnel) :",
    "prompt.deleteStash": (i) => `Supprimer le stash #${i} ?`,
    // Palette / sidebar actions
    "palette.fetch": "Fetch",
    "palette.pull": "Pull",
    "palette.push": "Push",
    "palette.newBranch": "Nouvelle branche",
    "palette.openRepo": "Ouvrir un d\xE9p\xF4t",
    "palette.refresh": "Rafra\xEEchir",
    "palette.checkout": (name) => `Checkout ${name}`,
    "palette.merge": (name) => `Merger ${name}`,
    "palette.applyStash": (msg) => `Appliquer stash: ${msg}`,
    // Welcome
    "welcome.hint": "Visualisez vos branches, indexez vos changements et g\xE9rez vos commits.",
    "welcome.open": "Ouvrir un d\xE9p\xF4t",
    "welcome.recents": "R\xE9cents",
    // Create PR modal
    "pr.title": "Cr\xE9er une Pull Request",
    "pr.titleLabel": "Titre",
    "pr.titlePlaceholder": "Titre de la Pull Request",
    "pr.bodyLabel": "Description",
    "pr.bodyPlaceholder": "D\xE9crivez vos changements (optionnel)\u2026",
    "pr.baseLabel": "Branche de destination",
    "pr.headLabel": "Branche source",
    "pr.submit": "Cr\xE9er la Pull Request",
    "pr.submitting": "Cr\xE9ation\u2026",
    "pr.success": (n) => `\u2713 PR #${n} cr\xE9\xE9e`,
    "pr.openInBrowser": "Ouvrir sur GitHub",
    "pr.noAuth": "Connectez-vous \xE0 GitHub dans les Param\xE8tres.",
    "pr.noRemote": "Aucun remote GitHub d\xE9tect\xE9.",
    "pr.error": (e) => `Erreur : ${e}`,
    "toolbar.createPR.tooltip": "Cr\xE9er une Pull Request",
    // GitHub Panel
    "gh.panel.noRepo": "Aucun remote GitHub d\xE9tect\xE9 pour ce d\xE9p\xF4t.",
    "gh.panel.noAuth": "Connectez-vous \xE0 GitHub dans les Param\xE8tres pour voir les PRs et Issues.",
    "gh.panel.loading": "Chargement\u2026",
    "gh.panel.refresh": "Rafra\xEEchir",
    "gh.panel.tabPRs": "Pull Requests",
    "gh.panel.tabIssues": "Issues",
    "gh.panel.noPRs": "Aucune Pull Request ouverte",
    "gh.panel.noIssues": "Aucune Issue ouverte",
    "gh.panel.draft": "Draft",
    "gh.panel.openIn": "Ouvrir sur GitHub",
    "gh.panel.comments": (n) => `${n} commentaire${n !== 1 ? "s" : ""}`,
    "gh.panel.ago": (s) => `il y a ${s}`,
    "gh.panel.error": (e) => `Erreur : ${e}`,
    "toolbar.github.tooltip": "PRs & Issues GitHub",
    // Clone from GitHub
    "clone.title": "Cloner depuis GitHub",
    "clone.urlTitle": "Cloner depuis une URL",
    "clone.tabRepos": "Mes repos",
    "clone.tabUrl": "URL",
    "clone.search": "Rechercher un repo\u2026",
    "clone.noRepos": "Aucun repo trouv\xE9",
    "clone.noAuth": "Connectez-vous \xE0 GitHub dans les Param\xE8tres pour acc\xE9der \xE0 vos repos.",
    "clone.loading": "Chargement des repos\u2026",
    "clone.private": "Priv\xE9",
    "clone.public": "Public",
    "clone.stars": (n) => `${n} \u2605`,
    "clone.cloneBtn": "Cloner",
    "clone.cloning": "Clonage\u2026",
    "clone.urlPlaceholder": "https://github.com/utilisateur/repo.git",
    "clone.urlCloneBtn": "Cloner depuis cette URL",
    "clone.ok": (name) => `\u2713 "${name}" clon\xE9 avec succ\xE8s`,
    "clone.err": (e) => `Erreur : ${e}`,
    "toolbar.clone.tooltip": "Cloner un repo GitHub",
    "toast.cloneOk": (name) => `\u2713 "${name}" clon\xE9`,
    "toast.cloneErr": (e) => `Clone \xE9chou\xE9 : ${e}`,
    // Issue links
    "issue.open": "Ouvert",
    "issue.closed": "Ferm\xE9",
    "issue.merged": "Merg\xE9",
    "issue.loading": "Chargement\u2026",
    "graph.emptyRepo": "D\xE9p\xF4t sans commit \u2014 ajoutez ou modifiez des fichiers, ils appara\xEEtront ici pour cr\xE9er votre premier commit",
    "toast.undo": "Annuler",
    "panel.ccType.tooltip": "Type de commit conventionnel (feat, fix\u2026)"
  };
  var en = {
    // Toolbar
    "toolbar.fetch.tooltip": "Fetch \u2014 retrieves remote refs",
    "toolbar.pull.tooltip": "Pull \u2014 integrates remote commits",
    "toolbar.push.tooltip": "Push \u2014 sends local commits (direct push if upstream configured)",
    "toolbar.pushModal.tooltip": "Choose remote / upstream branch",
    "toolbar.newBranch.tooltip": "New branch",
    "toolbar.allBranches.tooltip": "Show all branches",
    "toolbar.refresh.tooltip": "Refresh",
    "toolbar.gitflow.tooltip": "Gitflow \u2014 feature / release / hotfix",
    "tabs.new": "New tab",
    "tabs.close": "Close tab",
    "tabs.closeOthers": "Close other tabs",
    "tabs.openRepo": "\u{1F4C2} Open a repository\u2026",
    "tabs.clone": " Clone from GitHub\u2026",
    "gitflow.loading": "Loading\u2026",
    "gitflow.notInit": "Gitflow is not initialized in this repository.",
    "gitflow.initBtn": 'Initialize Gitflow (create "develop")',
    "gitflow.mainBranch": "Main branch:",
    "gitflow.col.feature": "Features",
    "gitflow.col.release": "Releases",
    "gitflow.col.hotfix": "Hotfixes",
    "gitflow.none": "No branches",
    "gitflow.start": "Start",
    "gitflow.finish": "Finish",
    "gitflow.prompt.startName": (type) => `${type} name:`,
    "gitflow.prompt.finish": (type, name) => `Finish ${type}/${name}?
(merge + delete the branch)`,
    "gitflow.prompt.tag": "Tag name (leave empty to skip tagging):",
    "gitflow.toast.init": '\u2713 Gitflow initialized ("develop" branch created)',
    "gitflow.toast.started": (type, name) => `\u2713 ${type}/${name} started`,
    "gitflow.toast.finished": (type, name) => `\u2713 ${type}/${name} finished`,
    "toolbar.fetchedNow": "fetched just now",
    "toolbar.fetchedAgo": (mins) => `fetched ${mins} min ago`,
    "statusbar.ahead": (n) => `${n} commit(s) ahead of remote`,
    "statusbar.behind": (n) => `${n} commit(s) behind remote`,
    "statusbar.zoomReset": "Reset zoom (100%)",
    "toolbar.autoFetch.tooltip": "Auto-fetch active (every 5 min)",
    "toolbar.update.tooltip": "An update is ready to be installed",
    "toolbar.update.label": "Update",
    "toolbar.settings.tooltip": "Settings",
    "toolbar.openPR.tooltip": "Open a Pull Request on GitHub",
    "toolbar.search.placeholder": "Search commits\u2026",
    "toolbar.extSearch.tooltip": "Extended search in diffs",
    "toolbar.undo.tooltip": "Undo last action (reset --soft)",
    "toolbar.redo.tooltip": "Redo last undone action",
    "toolbar.stash.tooltip": "Stash changes",
    "toolbar.pop.tooltip": "Apply and remove latest stash (pop)",
    "toolbar.terminal.tooltip": "Open a terminal in the repository",
    // Update banner
    "update.banner": "\u{1F680} A new version is available and ready to install.",
    "update.install": "Restart and install",
    "update.later": "Later",
    // CommitGraph
    "graph.empty": "No commits to display",
    "graph.menu.checkout": "\u2713 Checkout (detached HEAD)",
    "graph.menu.createBranch": "\u{1F33F} Create branch here",
    "graph.menu.interactiveRebase": "\u26A1 Interactive Rebase from here",
    "graph.menu.editMessage": "\u270F\uFE0F Edit commit message",
    "graph.menu.cherryPick": "\u{1F352} Cherry-pick",
    "graph.menu.revert": "\u21A9 Revert",
    "graph.menu.dropCommit": "\u{1F5D1} Drop this commit",
    "graph.menu.moveUp": "\u2B06 Move commit up",
    "graph.menu.moveDown": "\u2B07 Move commit down",
    "graph.menu.resetSoft": "\u23EA Reset (soft) \u2014 keeps staged changes",
    "graph.menu.resetMixed": "\u23EA Reset (mixed) \u2014 keeps unstaged changes",
    "graph.menu.resetHard": "\u23EA Reset (hard) \u2014 deletes all changes",
    "graph.menu.createTag": "\u{1F3F7} Create tag here",
    "graph.menu.copyShortHash": "\u{1F4CB} Copy short hash",
    "graph.menu.copyFullHash": "\u{1F4CB} Copy full hash",
    "graph.menu.copyMessage": "\u{1F4CB} Copy message",
    "graph.menu.compareWorking": "\u21C4 Compare against working directory",
    "graph.drop.reset": (b, h) => `\u23EA Move "${b}" here (reset --hard ${h})`,
    "graph.drop.rebase": (b, h) => `\u26A1 Rebase "${b}" onto ${h}`,
    "graph.drop.merge": (b, h) => `\u21D2 Merge ${h} into "${b}"`,
    // PushModal
    "push.title": "\u2B06 Push",
    "push.localBranch": "Local branch",
    "push.noRemote": "No remote configured in this repository.",
    "push.remote": "Remote",
    "push.targetBranch": "Target branch",
    "push.targetBranch.placeholder": "remote branch name",
    "push.setUpstream": "Set as upstream (--set-upstream)",
    "push.force": "Force push (--force-with-lease)",
    "push.forceWarn": "\u26A0 Overwrites remote history. Refused if the remote got new commits since your last fetch.",
    "push.cancel": "Cancel",
    "push.pushing": "Pushing\u2026",
    "push.button": (remote, branch) => `\u2B06 Push to ${remote}/${branch}`,
    // RightPanel — staging
    "panel.staged": "Staged",
    "panel.unstaged": "Unstaged",
    "panel.unstageAll": "Unstage all",
    "panel.stageAll": "Stage all",
    "panel.refresh": "Refresh",
    "panel.noStaged": "No staged files",
    "panel.noChanges": "Clean working directory \u2713",
    "panel.noUnstaged": "No modified files",
    "panel.amendBadge.tooltip": "File from last commit (included in amend)",
    "panel.folder": "(folder)",
    "panel.stage.file": (f) => `Stage "${f}"`,
    "panel.stage.folder": (f) => `Stage entire folder "${f}"`,
    "panel.discard": "Discard changes",
    "panel.discard.confirm": (path) => `Discard changes to "${path}"?
This action is irreversible.`,
    "panel.deleteUntracked": "Delete untracked file",
    "panel.deleteUntracked.confirm": (path) => `Permanently delete "${path}" from disk?
This file is not tracked by Git \u2014 it will be lost.`,
    "panel.diff": "Diff",
    "panel.blame": "Blame",
    "panel.history": "File history",
    "panel.noFiles": (n) => `${n} file${n !== 1 ? "s" : ""}`,
    "panel.loading": "Loading\u2026",
    "panel.noDiff": "No diff",
    "panel.close": "Close",
    "panel.fileHistory": (name) => `History \u2014 ${name}`,
    "panel.noHistory": "No commits found",
    "panel.loadingBlame": "Loading blame\u2026",
    "panel.noBlame": "No blame data",
    "panel.copyHash": "Copy hash",
    "panel.clickToAmend": "Click to edit message (amend)",
    "panel.amendConfirm": "Update Message",
    "panel.amendCancel": "Cancel Amend",
    // RightPanel — commit
    "panel.commitMsg.placeholder": "Commit message\u2026\n\nOptional description",
    "panel.generate.tooltip": "Generate commit message with AI",
    "panel.commitDetails": "Commit details",
    "panel.stageAndCommit": "Stage and commit",
    "panel.commit": "Commit",
    "panel.clickCommit": "Click on a commit",
    // RightPanel — commit panel (GitKraken-style)
    "panel.discardAll": "Discard all changes",
    "panel.discardAll.confirm": (n) => `Discard changes to ${n} file(s)?
This action is irreversible.`,
    "panel.fileChange": "file change",
    "panel.fileChanges": "file changes",
    "panel.on": "on",
    "panel.sort": "Sort",
    "panel.view.path": "Path",
    "panel.view.tree": "Tree",
    "panel.tab.commit": "Commit",
    "panel.tab.stash": "Stash",
    "panel.tab.push": "Push",
    "panel.amendPrevious": "Amend previous commit",
    "panel.commit.summary": "Commit summary",
    "panel.commit.description": "Description",
    "panel.commitOptions": "Commit options",
    "panel.composeAI": "Compose commits with AI",
    "panel.signoff": "Add Signed-off-by",
    "panel.abort": "Abort",
    "panel.commit.inProgress": "Committing\u2026",
    "panel.commit.stageFirst": "Stage changes to commit",
    "panel.commit.typeMessage": "Type a Message to Commit",
    "panel.commit.amend": "Amend commit",
    "panel.commit.changes": (n, s) => `Commit Changes to ${n} File${s}`,
    // RightPanel — errors
    "panel.gen.noKey": "Missing API key \u2014 configure it in Settings \u2192 AI",
    "panel.gen.failed": (err) => `Generation failed: ${err}`,
    "panel.gen.empty": "Error: empty response received",
    "panel.gen.unexpected": (msg) => `Unexpected error: ${msg}`,
    // Settings
    "settings.title": "Settings",
    "settings.back": "Back",
    "settings.notifications": "Notifications",
    "settings.profile": "Profile",
    "settings.defaultProfile": "Default Profile",
    "settings.save": "Save",
    "settings.nav.git": "\u2387 Git",
    "settings.nav.github": "\u{1F419} GitHub",
    "settings.nav.ai": "\u2728 Artificial Intelligence",
    "settings.nav.notifications": "\u{1F514} Notifications",
    "settings.nav.about": "\u2139 About",
    "settings.notifications.title": "Desktop notifications",
    "settings.notifications.desc": "Choose which events trigger a system notification.",
    "settings.notifications.fetch": "New commits detected on fetch",
    "settings.notifications.commit": "Commit created successfully",
    "settings.notifications.update": "App update available",
    // Settings — Git
    "settings.git.title": "Global Git Configuration",
    "settings.git.desc": "These values are used to sign your commits (git config --global).",
    "settings.git.name": "Name",
    "settings.git.name.placeholder": "First Last",
    "settings.git.email": "Email",
    "settings.git.email.placeholder": "you@example.com",
    // Settings — GitHub
    "settings.github.title": "GitHub Connection",
    "settings.github.desc": "Connect your GitHub account to access Pull Requests, Issues and other collaborative features.",
    "settings.github.connected": "Connected",
    "settings.github.disconnect": "Disconnect",
    "settings.github.login": "Sign in with GitHub",
    "settings.github.connecting": "Connecting\u2026",
    // Settings — AI
    "settings.ai.title": "AI Provider",
    "settings.ai.desc": "Choose the provider used for automatic commit message generation.",
    "settings.ai.model": (p) => `Model \u2014 ${p}`,
    "settings.ai.modelsCount": (n) => `${n} models available`,
    "settings.ai.custom": "(custom)",
    "settings.ai.reloadModels": "Reload available models",
    "settings.ai.customPlaceholder": "or enter a custom model\u2026",
    "settings.ai.apiKey": (p) => `API Key \u2014 ${p}`,
    "settings.ai.show": "Show",
    "settings.ai.hide": "Hide",
    "settings.ai.howToKey": "How to get an API key ",
    "settings.ai.tuto.anthropic": [
      "1. Create an account on console.anthropic.com",
      "2. Go to Settings \u2192 API Keys",
      '3. Click "Create Key"',
      "4. Copy the key (it will not be visible again)"
    ],
    "settings.ai.tuto.google": [
      "1. Go to aistudio.google.com",
      '2. Click "Get API key" at top left',
      "3. Create a key in a Google Cloud project",
      "4. Copy the generated key"
    ],
    "settings.ai.tuto.groq": [
      "1. Create an account on console.groq.com",
      '2. Go to "API Keys" in the left menu',
      '3. Click "Create API Key"',
      "4. Copy the key (it will not be visible again)"
    ],
    "settings.ai.tuto.openai": [
      "1. Create an account on platform.openai.com",
      '2. Go to "API keys" in the left menu',
      '3. Click "Create new secret key"',
      "4. Copy the key (it will not be visible again)"
    ],
    "settings.ai.tuto.openLink": (label) => label,
    // Settings — About
    "settings.about.desc": "Fast, modern Git GUI. Visualize your branches, stage your changes and manage your commits easily.",
    "settings.about.sourceCode": "Source code",
    "settings.about.releases": "Releases",
    "settings.about.reportBug": "Report a bug",
    "settings.about.createdBy": "Created by",
    "settings.about.env": "Environment",
    "settings.about.license": "Distributed under MIT license",
    "settings.about.language": "Language",
    // Settings — Language
    "settings.lang.fr": "Fran\xE7ais",
    "settings.lang.en": "English",
    // Toasts
    "toast.fetchOk": "Fetch successful \u2713",
    "toast.fetchErr": (e) => `Fetch failed: ${e}`,
    "toast.pushOk": (upstream) => `Push successful \u2192 ${upstream} \u2713`,
    "toast.pushErr": (e) => `Push failed: ${e}`,
    "toast.pullOk": "Pull successful \u2713",
    "toast.pullErr": (e) => `Pull failed: ${e}`,
    "toast.checkoutOk": (name) => `\u2713 Checkout "${name}"`,
    "toast.checkoutErr": (e) => `Checkout failed: ${e}`,
    "toast.branchCreated": (name) => `\u2713 Branch "${name}" created`,
    "toast.branchCreatedCheckout": (name) => `\u2713 Branch "${name}" created + checkout`,
    "toast.branchDeleted": (name) => `Branch "${name}" deleted`,
    "toast.branchRenamed": (name) => `\u2713 Branch renamed to "${name}"`,
    "toast.mergeOk": (name) => `\u2713 Merge of "${name}" successful`,
    "toast.mergeErr": (e) => `Merge failed: ${e}`,
    "toast.cherryPickOk": (h) => `\u2713 Cherry-pick ${h} applied`,
    "toast.cherryPickErr": (e) => `Cherry-pick failed: ${e}`,
    "toast.revertOk": (h) => `\u2713 Revert ${h} applied`,
    "toast.revertErr": (e) => `Revert failed: ${e}`,
    "toast.resetOk": (mode, h) => `\u2713 Reset ${mode} to ${h}`,
    "toast.resetErr": (e) => `Reset failed: ${e}`,
    "toast.messageEdited": "\u2713 Commit message edited",
    "toast.commitDropped": (h) => `\u2713 Commit ${h} dropped`,
    "toast.commitMoved": "\u2713 Commit moved",
    "toast.rebaseOntoOk": (name) => `\u2713 Rebased onto "${name}"`,
    "toast.upstreamSet": (name) => `\u2713 Upstream set to origin/${name}`,
    "toast.branchDropOk": (name) => `\u2713 "${name}" updated`,
    "toast.tagCreated": (name) => `\u2713 Tag "${name}" created`,
    "toast.tagDeleted": (name) => `Tag "${name}" deleted`,
    "toast.tagPushed": (name) => `\u2713 Tag "${name}" pushed`,
    "toast.tagDeletedRemote": (name) => `Remote tag "${name}" deleted`,
    "toast.stashCreated": "\u2713 Stash created",
    "toast.stashErr": (e) => `Stash failed: ${e}`,
    "toast.stashApplied": (i) => `\u2713 Stash #${i} applied (kept)`,
    "toast.stashPopped": (i) => `\u2713 Stash #${i} applied and deleted`,
    "toast.stashDropped": (i) => `Stash #${i} deleted`,
    "toast.rebaseContinued": "\u2713 Rebase continued successfully",
    "toast.mergeContinued": "\u2713 Merge continued successfully",
    "toast.rebaseAborted": "Rebase aborted",
    "toast.commitOk": "Commit created \u2713",
    "toast.commitErr": (e) => `Error: ${e}`,
    "toast.err": (e) => `Error: ${e}`,
    "toast.unexpected": (e) => `Unexpected error: ${e}`,
    "toast.githubConnected": "Connected to GitHub \u2713",
    "toast.githubErr": (e) => `GitHub connection failed: ${e}`,
    "toast.githubDisconnected": "Disconnected from GitHub",
    "toast.gitConfigSaved": "Git config saved \u2713",
    "toast.aiSaved": "AI settings saved \u2713",
    "toast.applyErr": (e) => `Apply failed: ${e}`,
    "toast.popErr": (e) => `Pop failed: ${e}`,
    "toast.dropErr": (e) => `Drop failed: ${e}`,
    "toast.renameErr": (e) => `Rename failed: ${e}`,
    "toast.deleteErr": (e) => `Error: ${e}`,
    // Prompts / confirms
    "prompt.newBranch": "New branch name:",
    "prompt.deleteBranch": (name) => `Delete branch "${name}"?`,
    "prompt.mergeBranch": (name, cur) => `Merge "${name}" into "${cur}"?`,
    "prompt.renameBranch": (name) => `Rename "${name}" to:`,
    "prompt.checkoutNow": (name) => `Checkout to "${name}" immediately?`,
    "prompt.resetHard": (h) => `Reset hard to ${h}?
All uncommitted changes will be lost.`,
    "prompt.editMessage": "New commit message:",
    "prompt.dropCommit": (h) => `Drop commit ${h}?
This rewrites history via a rebase.`,
    "prompt.rebaseOnto": (cur, name) => `Rebase "${cur}" onto "${name}"?`,
    "prompt.deleteRemoteBranch": (name) => `Delete remote branch "${name}"?`,
    "prompt.dropReset": (b, h) => `Move "${b}" to ${h} (reset --hard)?
Commits beyond this point will be lost for that branch.`,
    "prompt.deleteTag": (name) => `Delete tag "${name}"?`,
    "prompt.deleteRemoteTag": (name) => `Delete tag "${name}" on the remote? (irreversible)`,
    "prompt.tagName": "Tag name:",
    "prompt.tagMessage": "Tag message (leave empty for lightweight tag):",
    "prompt.stashMessage": "Stash message (optional):",
    "prompt.deleteStash": (i) => `Delete stash #${i}?`,
    // Palette / sidebar actions
    "palette.fetch": "Fetch",
    "palette.pull": "Pull",
    "palette.push": "Push",
    "palette.newBranch": "New branch",
    "palette.openRepo": "Open a repository",
    "palette.refresh": "Refresh",
    "palette.checkout": (name) => `Checkout ${name}`,
    "palette.merge": (name) => `Merge ${name}`,
    "palette.applyStash": (msg) => `Apply stash: ${msg}`,
    // Welcome
    "welcome.hint": "Visualize your branches, stage your changes and manage your commits.",
    "welcome.open": "Open a repository",
    "welcome.recents": "Recent",
    // Create PR modal
    "pr.title": "Create a Pull Request",
    "pr.titleLabel": "Title",
    "pr.titlePlaceholder": "Pull Request title",
    "pr.bodyLabel": "Description",
    "pr.bodyPlaceholder": "Describe your changes (optional)\u2026",
    "pr.baseLabel": "Base branch",
    "pr.headLabel": "Source branch",
    "pr.submit": "Create Pull Request",
    "pr.submitting": "Creating\u2026",
    "pr.success": (n) => `\u2713 PR #${n} created`,
    "pr.openInBrowser": "Open on GitHub",
    "pr.noAuth": "Connect to GitHub in Settings.",
    "pr.noRemote": "No GitHub remote detected.",
    "pr.error": (e) => `Error: ${e}`,
    "toolbar.createPR.tooltip": "Create a Pull Request",
    // GitHub Panel
    "gh.panel.noRepo": "No GitHub remote detected for this repository.",
    "gh.panel.noAuth": "Connect to GitHub in Settings to view PRs and Issues.",
    "gh.panel.loading": "Loading\u2026",
    "gh.panel.refresh": "Refresh",
    "gh.panel.tabPRs": "Pull Requests",
    "gh.panel.tabIssues": "Issues",
    "gh.panel.noPRs": "No open Pull Requests",
    "gh.panel.noIssues": "No open Issues",
    "gh.panel.draft": "Draft",
    "gh.panel.openIn": "Open on GitHub",
    "gh.panel.comments": (n) => `${n} comment${n !== 1 ? "s" : ""}`,
    "gh.panel.ago": (s) => `${s} ago`,
    "gh.panel.error": (e) => `Error: ${e}`,
    "toolbar.github.tooltip": "PRs & Issues GitHub",
    // Clone from GitHub
    "clone.title": "Clone from GitHub",
    "clone.urlTitle": "Clone from URL",
    "clone.tabRepos": "My repos",
    "clone.tabUrl": "URL",
    "clone.search": "Search a repo\u2026",
    "clone.noRepos": "No repos found",
    "clone.noAuth": "Connect to GitHub in Settings to access your repos.",
    "clone.loading": "Loading repos\u2026",
    "clone.private": "Private",
    "clone.public": "Public",
    "clone.stars": (n) => `${n} \u2605`,
    "clone.cloneBtn": "Clone",
    "clone.cloning": "Cloning\u2026",
    "clone.urlPlaceholder": "https://github.com/user/repo.git",
    "clone.urlCloneBtn": "Clone from this URL",
    "clone.ok": (name) => `\u2713 "${name}" cloned successfully`,
    "clone.err": (e) => `Error: ${e}`,
    "toolbar.clone.tooltip": "Clone a GitHub repo",
    "toast.cloneOk": (name) => `\u2713 "${name}" cloned`,
    "toast.cloneErr": (e) => `Clone failed: ${e}`,
    // Issue links
    "issue.open": "Open",
    "issue.closed": "Closed",
    "issue.merged": "Merged",
    "issue.loading": "Loading\u2026",
    "graph.emptyRepo": "No commits yet \u2014 add or edit files and they will show up here so you can create your first commit",
    "toast.undo": "Undo",
    "panel.ccType.tooltip": "Conventional commit type (feat, fix\u2026)"
  };
  var translations = { fr, en };

  // ../src/renderer/src/i18n/LanguageContext.tsx
  var LanguageContext = (0, import_react2.createContext)(null);
  function LanguageProvider({ children }) {
    const [lang, setLangState] = (0, import_react2.useState)(
      () => localStorage.getItem("lang") ?? "fr"
    );
    const setLang = (0, import_react2.useCallback)((l) => {
      localStorage.setItem("lang", l);
      setLangState(l);
    }, []);
    const t = (0, import_react2.useCallback)((key, ...args) => {
      const val = translations[lang][key] ?? translations["fr"][key];
      if (typeof val === "function")
        return val(...args);
      return val;
    }, [lang]);
    return /* @__PURE__ */ import_react2.default.createElement(LanguageContext.Provider, { value: { lang, setLang, t } }, children);
  }
  function useLang() {
    const ctx = (0, import_react2.useContext)(LanguageContext);
    if (!ctx)
      throw new Error("useLang must be used inside LanguageProvider");
    return ctx;
  }

  // ../src/renderer/src/components/Toast/Toast.tsx
  var import_react3 = __toESM(require_react());
  var ToastContext = (0, import_react3.createContext)({
    success: () => {
    },
    error: () => {
    },
    info: () => {
    }
  });
  function useToast() {
    return (0, import_react3.useContext)(ToastContext);
  }
  function ToastProvider({ children }) {
    const [toasts, setToasts] = (0, import_react3.useState)([]);
    const counter = (0, import_react3.useRef)(0);
    const addToast = (0, import_react3.useCallback)((message, type, action) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, message, type, action }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, action ? 8e3 : 4e3);
    }, []);
    const ctx = {
      success: (msg, action) => addToast(msg, "success", action),
      error: (msg, action) => addToast(msg, "error", action),
      info: (msg, action) => addToast(msg, "info", action)
    };
    return /* @__PURE__ */ import_react3.default.createElement(ToastContext.Provider, { value: ctx }, children, /* @__PURE__ */ import_react3.default.createElement("div", { className: "toast-container" }, toasts.map((t) => /* @__PURE__ */ import_react3.default.createElement("div", { key: t.id, className: `toast-item toast-${t.type}` }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "toast-icon" }, t.type === "success" ? "\u2713" : t.type === "error" ? "\u2715" : "\u2139"), /* @__PURE__ */ import_react3.default.createElement("span", { className: "toast-msg" }, t.message), t.action && /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        className: "toast-action",
        onClick: () => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id));
          t.action.onClick();
        }
      },
      t.action.label
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        className: "toast-dismiss",
        onClick: () => setToasts((prev) => prev.filter((x) => x.id !== t.id))
      },
      "\xD7"
    )))));
  }

  // src/webview/CompactToolbar.tsx
  var import_react4 = __toESM(require_react());
  function IconBtn({ title, onClick, disabled, active, badge, hideNarrow, children }) {
    return /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        className: `gvt-btn${active ? " gvt-btn--active" : ""}${hideNarrow ? " gvt-hide-narrow" : ""}`,
        title,
        onClick,
        disabled
      },
      children,
      badge != null && badge > 0 && /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-badge" }, badge)
    );
  }
  function TextBtn({ title, label, onClick, disabled, children }) {
    return /* @__PURE__ */ import_react4.default.createElement("button", { className: "gvt-tbtn", title, onClick, disabled }, children, /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-tbtn-label" }, label));
  }
  function relTime(d) {
    if (!d)
      return "";
    const s = Math.floor((Date.now() - d.getTime()) / 1e3);
    if (s < 60)
      return "\xE0 l'instant";
    if (s < 3600)
      return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400)
      return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }
  function CompactToolbar(p) {
    const [branchOpen, setBranchOpen] = (0, import_react4.useState)(false);
    const branchRef = (0, import_react4.useRef)(null);
    (0, import_react4.useEffect)(() => {
      if (!branchOpen)
        return;
      const onDown = (e) => {
        if (branchRef.current && !branchRef.current.contains(e.target))
          setBranchOpen(false);
      };
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }, [branchOpen]);
    const locals = p.branches.filter((b) => !b.remote && !b.name.includes("HEAD"));
    return /* @__PURE__ */ import_react4.default.createElement("div", { className: "gvt" }, /* @__PURE__ */ import_react4.default.createElement("svg", { className: "gvt-logo", viewBox: "0 0 512 512", width: "16", height: "16", "aria-hidden": true }, /* @__PURE__ */ import_react4.default.createElement("line", { x1: "148", y1: "82", x2: "256", y2: "422", stroke: "#3fb950", strokeWidth: "40", strokeLinecap: "round" }), /* @__PURE__ */ import_react4.default.createElement("line", { x1: "364", y1: "82", x2: "256", y2: "422", stroke: "#58a6ff", strokeWidth: "40", strokeLinecap: "round" }), /* @__PURE__ */ import_react4.default.createElement("circle", { cx: "256", cy: "422", r: "34", fill: "#3fb950" })), p.repoName && /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-repo" }, p.repoName), /* @__PURE__ */ import_react4.default.createElement("div", { className: "gvt-branch-wrap", ref: branchRef }, /* @__PURE__ */ import_react4.default.createElement("button", { className: "gvt-branch", title: "Changer de branche", onClick: () => setBranchOpen((o) => !o) }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "11", height: "11", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" })), /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-branch-name" }, p.branch || "\u2014"), /* @__PURE__ */ import_react4.default.createElement("svg", { width: "8", height: "8", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" }))), branchOpen && /* @__PURE__ */ import_react4.default.createElement("div", { className: "gvt-branch-menu" }, locals.length === 0 && /* @__PURE__ */ import_react4.default.createElement("div", { className: "gvt-branch-empty" }, "Aucune branche locale"), locals.map((b) => /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        key: b.name,
        className: `gvt-branch-item${b.current ? " gvt-branch-item--current" : ""}`,
        onClick: () => {
          setBranchOpen(false);
          if (!b.current)
            p.onCheckout(b.name);
        }
      },
      /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-branch-tick" }, b.current ? "\u2713" : ""),
      /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-branch-label" }, b.name)
    )))), /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-spring" }), /* @__PURE__ */ import_react4.default.createElement(TextBtn, { title: p.lastFetch ? `Fetch \xB7 ${relTime(p.lastFetch)}` : "Fetch", label: "Fetch", onClick: p.onFetch, disabled: p.loading }, /* @__PURE__ */ import_react4.default.createElement("svg", { className: p.loading ? "gvt-spin" : "", width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" }))), /* @__PURE__ */ import_react4.default.createElement(TextBtn, { title: "Pull", label: "Pull", onClick: p.onPull, disabled: p.loading }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react4.default.createElement("line", { x1: "12", y1: "3", x2: "12", y2: "15" }), /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "7 10 12 15 17 10" }), /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "3 21 21 21" }))), /* @__PURE__ */ import_react4.default.createElement(TextBtn, { title: "Push", label: "Push", onClick: p.onPush, disabled: p.loading }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react4.default.createElement("line", { x1: "12", y1: "21", x2: "12", y2: "9" }), /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "7 14 12 9 17 14" }), /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "3 3 21 3" }))), /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-sep" }), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "Nouvelle branche", onClick: p.onNewBranch }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" }))), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "Stash", onClick: p.onStash }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M22 12h-6l-2 3h-4l-2-3H2" }), /* @__PURE__ */ import_react4.default.createElement("path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" }))), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "Pop stash", onClick: p.onPop, disabled: p.stashCount === 0, badge: p.stashCount }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M12 4v8" }), /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "8 8 12 4 16 8" }), /* @__PURE__ */ import_react4.default.createElement("path", { d: "M22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6" }))), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "Annuler la derni\xE8re action", onClick: p.onUndo }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "9 14 4 9 9 4" }), /* @__PURE__ */ import_react4.default.createElement("path", { d: "M20 20v-7a4 4 0 0 0-4-4H4" }))), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "R\xE9tablir la derni\xE8re action annul\xE9e", onClick: p.onRedo }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "15 14 20 9 15 4" }), /* @__PURE__ */ import_react4.default.createElement("path", { d: "M4 20v-7a4 4 0 0 1 4-4h12" }))), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "Terminal", onClick: p.onTerminal, hideNarrow: true }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "4 17 10 11 4 5" }), /* @__PURE__ */ import_react4.default.createElement("line", { x1: "12", y1: "19", x2: "20", y2: "19" }))), /* @__PURE__ */ import_react4.default.createElement("span", { className: "gvt-sep" }), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "Afficher toutes les branches", onClick: p.onToggleAllBranches, active: p.showAllBranches }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218zM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM5 3.25a.75.75 0 1 0 0 .005V3.25z" }))), /* @__PURE__ */ import_react4.default.createElement(IconBtn, { title: "Ouvrir dans Git Vertex Desktop", onClick: p.onOpenDesktop, hideNarrow: true }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), /* @__PURE__ */ import_react4.default.createElement("polyline", { points: "15 3 21 3 21 9" }), /* @__PURE__ */ import_react4.default.createElement("line", { x1: "10", y1: "14", x2: "21", y2: "3" }))), /* @__PURE__ */ import_react4.default.createElement("div", { className: "gvt-search" }, /* @__PURE__ */ import_react4.default.createElement("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react4.default.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ import_react4.default.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })), /* @__PURE__ */ import_react4.default.createElement("input", { type: "text", placeholder: "Rechercher\u2026", value: p.searchQuery, onChange: (e) => p.onSearch(e.target.value) }), p.searchQuery && p.searchMatches != null && p.searchMatches >= 0 && /* @__PURE__ */ import_react4.default.createElement("span", { className: `gvt-search-count${p.searchMatches === 0 ? " gvt-search-count--none" : ""}` }, p.searchMatches), p.searchQuery && /* @__PURE__ */ import_react4.default.createElement("button", { className: "gvt-search-clear", onClick: () => p.onSearch("") }, "\xD7")));
  }

  // ../src/renderer/src/components/CommitGraph/CommitGraph.tsx
  var import_react7 = __toESM(require_react());
  var import_react_dom3 = __toESM(require_react_dom());

  // ../src/renderer/src/components/CommitGraph/graph-layout.ts
  var LANE_COLORS = [
    "#2dd4bf",
    // teal
    "#4d9de0",
    // blue
    "#9b59b6",
    // purple
    "#e879f9",
    // fuchsia
    "#22d3ee",
    // cyan
    "#818cf8",
    // indigo
    "#a78bfa",
    // lavender
    "#34d399",
    // emerald
    "#60a5fa",
    // cornflower
    "#f472b6"
    // pink
  ];
  function computeGraphLayout(commits) {
    if (!commits.length)
      return [];
    const idx = /* @__PURE__ */ new Map();
    commits.forEach((c, i) => idx.set(c.hash, i));
    const has = (h) => h !== void 0 && idx.has(h);
    const firstParent = (h) => {
      const c = commits[idx.get(h)];
      return c && has(c.parents[0]) ? c.parents[0] : null;
    };
    const isFpChild = /* @__PURE__ */ new Set();
    for (const c of commits)
      if (has(c.parents[0]))
        isFpChild.add(c.parents[0]);
    const refBranchNames = (h) => commits[idx.get(h)].refs.filter((r) => !r.startsWith("tag:")).map((r) => r.replace(/^HEAD ->\s*/, "").replace(/^(origin\/|remotes\/[^/]+\/)/, "").trim());
    const isBackbone = (tip) => {
      let h = tip;
      const seen = /* @__PURE__ */ new Set();
      while (h && !seen.has(h)) {
        seen.add(h);
        const names = refBranchNames(h);
        if (names.some((n) => n === "main" || n === "master"))
          return true;
        if (names.length > 0)
          return false;
        h = firstParent(h);
      }
      return false;
    };
    const tips = commits.filter((c) => !isFpChild.has(c.hash)).map((c) => c.hash).sort((a, b) => {
      const pa = isBackbone(a) ? 0 : 1;
      const pb = isBackbone(b) ? 0 : 1;
      return pa - pb || idx.get(a) - idx.get(b);
    });
    const owner = /* @__PURE__ */ new Map();
    for (const tip of tips) {
      let h = tip;
      while (h && !owner.has(h)) {
        owner.set(h, tip);
        h = firstParent(h);
      }
    }
    const laneOf = /* @__PURE__ */ new Map();
    const occupant = [];
    const colorOf = /* @__PURE__ */ new Map();
    let colorN = 0;
    const allocLane = (tip) => {
      let ln = occupant.indexOf(null);
      if (ln === -1) {
        ln = occupant.length;
        occupant.push(null);
      }
      occupant[ln] = tip;
      laneOf.set(tip, ln);
      if (!colorOf.has(tip))
        colorOf.set(tip, LANE_COLORS[colorN++ % LANE_COLORS.length]);
      return ln;
    };
    const bottom = /* @__PURE__ */ new Map();
    for (const c of commits) {
      const t = owner.get(c.hash);
      const cur = bottom.get(t);
      if (cur === void 0 || idx.get(c.hash) > idx.get(cur))
        bottom.set(t, c.hash);
    }
    const dieAt = /* @__PURE__ */ new Map();
    for (const [tip, b] of bottom) {
      const f = firstParent(b);
      if (!f)
        continue;
      const r = idx.get(f);
      const arr = dieAt.get(r);
      if (arr)
        arr.push(tip);
      else
        dieAt.set(r, [tip]);
    }
    const laneByHash = /* @__PURE__ */ new Map();
    for (let r = 0; r < commits.length; r++) {
      const c = commits[r];
      const line = owner.get(c.hash);
      if (!laneOf.has(line))
        allocLane(line);
      laneByHash.set(c.hash, laneOf.get(line));
      for (const tip of dieAt.get(r) ?? []) {
        if (tip === line)
          continue;
        const ln = laneOf.get(tip);
        if (ln !== void 0)
          occupant[ln] = null;
        laneOf.delete(tip);
      }
      for (let p = 1; p < c.parents.length; p++) {
        const ph = c.parents[p];
        if (!has(ph))
          continue;
        const pLine = owner.get(ph);
        if (!laneOf.has(pLine))
          allocLane(pLine);
      }
      while (occupant.length && occupant[occupant.length - 1] === null)
        occupant.pop();
    }
    const result = [];
    for (let r = 0; r < commits.length; r++) {
      const c = commits[r];
      const lane = laneByHash.get(c.hash);
      const color = colorOf.get(owner.get(c.hash));
      const edges = [];
      c.parents.forEach((ph, pi) => {
        if (!has(ph))
          return;
        const toRow = idx.get(ph);
        const toLane = laneByHash.get(ph);
        if (pi === 0) {
          if (toLane === lane) {
            edges.push({ fromLane: lane, toLane: lane, toRow, color, type: "straight" });
          } else {
            edges.push({ fromLane: lane, toLane, toRow, color, type: toLane < lane ? "fork-left" : "fork-right" });
          }
        } else {
          const pColor = colorOf.get(owner.get(ph));
          edges.push({ fromLane: lane, toLane, toRow, color: pColor, type: toLane < lane ? "merge-left" : "merge-right" });
        }
      });
      result.push({ ...c, row: r, lane, color, edges, ownerTip: owner.get(c.hash) });
    }
    return result;
  }

  // ../src/renderer/src/components/ContextMenu/ContextMenu.tsx
  var import_react5 = __toESM(require_react());
  var import_react_dom = __toESM(require_react_dom());
  function ContextMenu({ x, y, items, onClose }) {
    const ref = (0, import_react5.useRef)(null);
    (0, import_react5.useEffect)(() => {
      const onMouseDown = (e) => {
        if (ref.current && !ref.current.contains(e.target))
          onClose();
      };
      const onKeyDown = (e) => {
        if (e.key === "Escape")
          onClose();
      };
      document.addEventListener("mousedown", onMouseDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [onClose]);
    (0, import_react5.useEffect)(() => {
      if (!ref.current)
        return;
      const rect = ref.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const M = 4;
      let left = x;
      if (x + rect.width > vw)
        left = vw - rect.width - M;
      left = Math.max(M, left);
      let top = y;
      if (y + rect.height > vh)
        top = vh - rect.height - M;
      top = Math.max(M, top);
      ref.current.style.left = `${left}px`;
      ref.current.style.top = `${top}px`;
    }, [x, y]);
    const menu = /* @__PURE__ */ import_react5.default.createElement(
      "div",
      {
        ref,
        className: "ctx-menu",
        style: { position: "fixed", left: x, top: y, zIndex: 9999 }
      },
      items.map((item, i) => {
        if ("separator" in item) {
          return /* @__PURE__ */ import_react5.default.createElement("div", { key: i, className: "ctx-sep" });
        }
        return /* @__PURE__ */ import_react5.default.createElement(
          "button",
          {
            key: i,
            className: `ctx-item${item.danger ? " ctx-danger" : ""}${item.disabled ? " ctx-disabled" : ""}`,
            disabled: item.disabled,
            onClick: () => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }
          },
          item.label
        );
      })
    );
    return (0, import_react_dom.createPortal)(menu, document.body);
  }

  // ../src/renderer/src/utils/aiAvatars.ts
  var svgUri = (svg) => "data:image/svg+xml;base64," + btoa(svg);
  function claudeSvg() {
    const rays = Array.from(
      { length: 12 },
      (_, i) => `<rect x='23' y='5' width='2' height='11' rx='1' transform='rotate(${i * 30} 24 24)'/>`
    ).join("");
    return `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><rect width='48' height='48' rx='9' fill='#D97757'/><g fill='#fff'>${rays}</g></svg>`;
  }
  function openaiSvg() {
    const petals = Array.from(
      { length: 6 },
      (_, i) => `<rect x='22.2' y='9' width='3.6' height='14' rx='1.8' transform='rotate(${i * 60} 24 24)'/>`
    ).join("");
    return `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><rect width='48' height='48' rx='9' fill='#10A37F'/><g fill='#fff'>${petals}<circle cx='24' cy='24' r='3.4'/></g></svg>`;
  }
  function geminiSvg() {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><rect width='48' height='48' rx='9' fill='#1A73E8'/><path fill='#fff' d='M24 10c.8 6.8 3.2 9.2 10 10-6.8.8-9.2 3.2-10 10-.8-6.8-3.2-9.2-10-10 6.8-.8 9.2-3.2 10-10z'/></svg>`;
  }
  var cache = null;
  function brands() {
    if (!cache)
      cache = { claude: svgUri(claudeSvg()), openai: svgUri(openaiSvg()), gemini: svgUri(geminiSvg()) };
    return cache;
  }
  function aiAvatarDataUri(name, email) {
    const n = (name || "").toLowerCase();
    const e = (email || "").toLowerCase();
    const b = brands();
    if (e.includes("anthropic.com") || n.includes("claude"))
      return b.claude;
    if (e.includes("openai.com") || n.includes("chatgpt") || n.includes("openai"))
      return b.openai;
    if (n.includes("gemini") || e.includes("gemini"))
      return b.gemini;
    return null;
  }

  // ../src/renderer/src/components/IssueLink/IssueLink.tsx
  var import_react6 = __toESM(require_react());
  var import_react_dom2 = __toESM(require_react_dom());
  var issueCache = /* @__PURE__ */ new Map();
  var issuePending = /* @__PURE__ */ new Map();
  function fetchIssue(repo, number) {
    const key = `${repo.owner}/${repo.repo}#${number}`;
    if (issueCache.has(key))
      return Promise.resolve(issueCache.get(key));
    const pending2 = issuePending.get(key);
    if (pending2)
      return pending2;
    const p = window.gitAPI.githubGetIssue(repo.owner, repo.repo, number).then((r) => {
      const info = r?.issue ?? null;
      issueCache.set(key, info);
      issuePending.delete(key);
      return info;
    }).catch(() => {
      issuePending.delete(key);
      return null;
    });
    issuePending.set(key, p);
    return p;
  }
  function stateMeta(info) {
    if (info.isPR && info.merged)
      return { color: "#a371f7", labelKey: "issue.merged" };
    if (info.state === "open")
      return { color: "#3fb950", labelKey: "issue.open" };
    if (info.isPR)
      return { color: "#f85149", labelKey: "issue.closed" };
    return { color: "#a371f7", labelKey: "issue.closed" };
  }
  function IssueLink({ repo, number }) {
    const { t } = useLang();
    const [info, setInfo] = (0, import_react6.useState)(void 0);
    const [tipPos, setTipPos] = (0, import_react6.useState)(null);
    const hoverTimer = (0, import_react6.useRef)(null);
    const anchorRef = (0, import_react6.useRef)(null);
    const mounted = (0, import_react6.useRef)(true);
    (0, import_react6.useEffect)(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        if (hoverTimer.current)
          clearTimeout(hoverTimer.current);
      };
    }, []);
    const onEnter = () => {
      if (hoverTimer.current)
        clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect)
          return;
        setTipPos({
          left: Math.min(rect.left, window.innerWidth - 380),
          bottom: window.innerHeight - rect.top + 6
        });
        fetchIssue(repo, number).then((i) => {
          if (mounted.current)
            setInfo(i);
        });
      }, 350);
    };
    const onLeave = () => {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
      setTipPos(null);
    };
    const open = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const url = info?.url ?? `https://github.com/${repo.owner}/${repo.repo}/issues/${number}`;
      window.gitAPI.openExternal(url);
    };
    return /* @__PURE__ */ React.createElement("span", { className: "issue-link-wrap", onMouseEnter: onEnter, onMouseLeave: onLeave }, /* @__PURE__ */ React.createElement("a", { ref: anchorRef, className: "issue-link", onClick: open, onDoubleClick: (e) => e.stopPropagation() }, "#", number), tipPos && (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ React.createElement("span", { className: "issue-tooltip", style: { left: tipPos.left, bottom: tipPos.bottom }, onClick: (e) => e.stopPropagation() }, info === void 0 ? /* @__PURE__ */ React.createElement("span", { className: "issue-tooltip-loading" }, t("issue.loading")) : info === null ? /* @__PURE__ */ React.createElement("span", { className: "issue-tooltip-loading" }, "#", number, " \u2014 ", repo.owner, "/", repo.repo) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "issue-tooltip-head" }, /* @__PURE__ */ React.createElement("span", { className: "issue-state-dot", style: { background: stateMeta(info).color } }), /* @__PURE__ */ React.createElement("span", { className: "issue-state-label", style: { color: stateMeta(info).color } }, t(stateMeta(info).labelKey)), /* @__PURE__ */ React.createElement("span", { className: "issue-tooltip-kind" }, info.isPR ? "PR" : "Issue", " #", info.number)), /* @__PURE__ */ React.createElement("span", { className: "issue-tooltip-title" }, info.title))),
      document.body
    ));
  }
  var ISSUE_RE = /(?<![\w/])#(\d{1,6})\b/g;
  function linkifyIssues(text, repo) {
    if (!repo || !text || !text.includes("#"))
      return text;
    const parts = [];
    let last = 0;
    let m;
    ISSUE_RE.lastIndex = 0;
    while ((m = ISSUE_RE.exec(text)) !== null) {
      if (m.index > last)
        parts.push(text.slice(last, m.index));
      parts.push(/* @__PURE__ */ React.createElement(IssueLink, { key: `${m.index}-${m[1]}`, repo, number: parseInt(m[1], 10) }));
      last = m.index + m[0].length;
    }
    if (parts.length === 0)
      return text;
    if (last < text.length)
      parts.push(text.slice(last));
    return /* @__PURE__ */ React.createElement(React.Fragment, null, parts);
  }

  // ../src/renderer/src/components/CommitGraph/CommitGraph.tsx
  var ROW_HEIGHT = 28;
  var LANE_WIDTH = 22;
  var NODE_RADIUS = 11;
  var SVG_PAD_L = 36;
  var SVG_PAD_R = 8;
  var WIP_HASH = "__WIP__";
  function useColResize(key, defaultW, min = 60) {
    const [w, setW] = (0, import_react7.useState)(() => parseInt(localStorage.getItem(key) || String(defaultW)));
    const startResize = (0, import_react7.useCallback)((e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = w;
      const onMove = (me) => {
        const next = Math.max(min, startW + me.clientX - startX);
        setW(next);
        localStorage.setItem(key, String(next));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }, [w, key, min]);
    return [w, startResize];
  }
  function dimColor(hex, factor = 0.4) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m)
      return hex;
    const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const bg = [13, 17, 23];
    const mix = (c, bgc) => Math.round(bgc + (c - bgc) * factor);
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(mix(r, bg[0]))}${toHex(mix(g, bg[1]))}${toHex(mix(b, bg[2]))}`;
  }
  function initials(name) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }
  function sigBadge(sig) {
    if (!sig || sig === "N")
      return null;
    const good = sig === "G" || sig === "U";
    const bad = sig === "B" || sig === "E";
    const cls = good ? "cg-sig--good" : bad ? "cg-sig--bad" : "cg-sig--warn";
    const titles = {
      G: "Signature valide",
      U: "Signature valide (validit\xE9 inconnue)",
      X: "Signature expir\xE9e",
      Y: "Cl\xE9 expir\xE9e",
      R: "Cl\xE9 r\xE9voqu\xE9e",
      B: "Signature invalide",
      E: "Signature non v\xE9rifiable"
    };
    return /* @__PURE__ */ import_react7.default.createElement("span", { className: `cg-sig ${cls}`, title: titles[sig] ?? "Sign\xE9" }, "\u{1F50F}");
  }
  function NodeAvatar({ cx, cy, r, email, name, color, clipId, sha }) {
    const aiLogo = aiAvatarDataUri(name, email);
    const [failed, setFailed] = (0, import_react7.useState)(false);
    const [src, setSrc] = (0, import_react7.useState)(aiLogo);
    (0, import_react7.useEffect)(() => {
      setFailed(false);
      if (aiLogo) {
        setSrc(aiLogo);
        return;
      }
      if (!email)
        return;
      window.gitAPI.avatarResolve(email, sha).then(setSrc).catch(() => {
      });
    }, [email, sha, aiLogo]);
    if (failed || !email || !src) {
      return /* @__PURE__ */ import_react7.default.createElement("g", null, /* @__PURE__ */ import_react7.default.createElement("circle", { cx, cy, r, fill: color }), /* @__PURE__ */ import_react7.default.createElement(
        "text",
        {
          x: cx,
          y: cy,
          dy: ".35em",
          textAnchor: "middle",
          fontSize: 8,
          fontWeight: "700",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          fill: "#ffffff"
        },
        initials(name)
      ));
    }
    return /* @__PURE__ */ import_react7.default.createElement("g", null, /* @__PURE__ */ import_react7.default.createElement("defs", null, /* @__PURE__ */ import_react7.default.createElement("clipPath", { id: clipId }, /* @__PURE__ */ import_react7.default.createElement("circle", { cx, cy, r }))), /* @__PURE__ */ import_react7.default.createElement("circle", { cx, cy, r, fill: "#161b22" }), /* @__PURE__ */ import_react7.default.createElement(
      "image",
      {
        href: src,
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        clipPath: `url(#${clipId})`,
        preserveAspectRatio: "xMidYMid slice",
        onError: () => setFailed(true)
      }
    ), /* @__PURE__ */ import_react7.default.createElement("circle", { cx, cy, r, fill: "none", stroke: color, strokeWidth: 1.5 }));
  }
  function fmtDate(s, format = "absolute") {
    try {
      const d = new Date(s);
      if (format === "relative")
        return fmtRelative(d);
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return s;
    }
  }
  function fmtRelative(d) {
    const sec = Math.floor((Date.now() - d.getTime()) / 1e3);
    if (sec < 60)
      return "\xE0 l'instant";
    const min = Math.floor(sec / 60);
    if (min < 60)
      return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)
      return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    if (j < 30)
      return `il y a ${j} j`;
    const mo = Math.floor(j / 30);
    if (mo < 12)
      return `il y a ${mo} mois`;
    return `il y a ${Math.floor(mo / 12)} an${mo >= 24 ? "s" : ""}`;
  }
  function processRefs(refs) {
    const filtered = refs.filter((r) => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r));
    const headSet = /* @__PURE__ */ new Set();
    const localSet = /* @__PURE__ */ new Set();
    const remoteMap = /* @__PURE__ */ new Map();
    const tags = [];
    for (const ref of filtered) {
      if (ref.includes("HEAD -> ")) {
        const b = ref.replace("HEAD -> ", "");
        headSet.add(b);
        localSet.add(b);
      } else if (ref.startsWith("tag:")) {
        tags.push(ref.replace("tag: ", ""));
      } else if (ref.includes("origin/") || ref.includes("remotes/")) {
        const short = ref.replace(/^(origin\/|remotes\/[^/]+\/)/, "");
        remoteMap.set(short, ref);
      } else {
        localSet.add(ref);
      }
    }
    const result = [];
    const usedRemotes = /* @__PURE__ */ new Set();
    const sortedLocals = [...localSet].sort(
      (a, b) => (headSet.has(b) ? 1 : 0) - (headSet.has(a) ? 1 : 0)
    );
    for (const name of sortedLocals) {
      const fullRemote = remoteMap.get(name);
      if (fullRemote)
        usedRemotes.add(name);
      const isHead = headSet.has(name);
      result.push({
        display: name,
        cls: isHead ? "rc-head" : "rc-local",
        branchName: name,
        tooltip: fullRemote ? `${name}  +  ${fullRemote}` : name,
        isHead,
        hasLocal: true,
        hasRemote: !!fullRemote
      });
    }
    for (const [short, full] of remoteMap) {
      if (!usedRemotes.has(short)) {
        result.push({
          display: short,
          cls: "rc-remote",
          branchName: full,
          tooltip: full,
          hasLocal: false,
          hasRemote: true
        });
      }
    }
    for (const tag of tags) {
      result.push({ display: tag, cls: "rc-tag", tooltip: tag });
    }
    return result;
  }
  var ICON_SIZE = 13;
  var IconMonitor = () => /* @__PURE__ */ import_react7.default.createElement("svg", { width: ICON_SIZE, height: ICON_SIZE, viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react7.default.createElement("path", { d: "M0 4s0-2 2-2h12s2 0 2 2v6s0 2-2 2h-4c0 .667.083 1.167.25 1.5H11a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h.75c.167-.333.25-.833.25-1.5H2s-2 0-2-2V4zm1.398-.855a.758.758 0 0 0-.254.302A1.46 1.46 0 0 0 1 4v6c0 .325.078.502.145.602.07.105.17.188.302.254a1.464 1.464 0 0 0 .538.143L2.5 11h11l.515-.001a1.464 1.464 0 0 0 .538-.143.758.758 0 0 0 .302-.254A.858.858 0 0 0 15 10V4a.857.857 0 0 0-.145-.598.758.758 0 0 0-.302-.254A1.464 1.464 0 0 0 14.013 3H1.987a1.464 1.464 0 0 0-.589.145z" }));
  var IconCloud = () => /* @__PURE__ */ import_react7.default.createElement("svg", { width: ICON_SIZE, height: ICON_SIZE, viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react7.default.createElement("path", { d: "M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.878 1.464-2.383z" }));
  var IconTag = () => /* @__PURE__ */ import_react7.default.createElement("svg", { width: ICON_SIZE, height: ICON_SIZE, viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react7.default.createElement("path", { d: "M6 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm-1 0a.5.5 0 1 0-1 0 .5.5 0 0 0 1 0z" }), /* @__PURE__ */ import_react7.default.createElement("path", { d: "M2 1h4.586a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 1 6.586V2a1 1 0 0 1 1-1zm0 5.586 7 7 4.586-4.586-7-7H2v4.586z" }));
  function RefChip({ pref, laneColor, onDoubleClick, onDragStartBranch, onDragEndBranch, onContextMenu }) {
    const isDraggable = (pref.cls === "rc-local" || pref.cls === "rc-head") && !!pref.branchName;
    const colorStyle = laneColor ? {
      color: laneColor,
      borderColor: laneColor + "99",
      background: laneColor + "22",
      cursor: pref.cls !== "rc-tag" ? "pointer" : void 0
    } : pref.cls !== "rc-tag" ? { cursor: "pointer" } : void 0;
    return /* @__PURE__ */ import_react7.default.createElement(
      "span",
      {
        className: `ref-chip ${pref.cls}`,
        title: pref.tooltip,
        draggable: isDraggable,
        onDragStart: (e) => {
          if (!isDraggable)
            return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", pref.branchName);
          onDragStartBranch?.(pref.branchName);
        },
        onDragEnd: () => onDragEndBranch?.(),
        onDoubleClick: (e) => {
          e.stopPropagation();
          if (pref.cls !== "rc-tag" && onDoubleClick && pref.branchName) {
            onDoubleClick(pref.branchName);
          }
        },
        onContextMenu: (e) => {
          if (onContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, pref);
          }
        },
        style: colorStyle
      },
      pref.isHead && /* @__PURE__ */ import_react7.default.createElement("span", { className: "rc-check" }, "\u2713"),
      /* @__PURE__ */ import_react7.default.createElement("span", { className: "rc-name" }, pref.display),
      pref.cls !== "rc-tag" && /* @__PURE__ */ import_react7.default.createElement("span", { className: "rc-icons", style: { width: pref.hasLocal && pref.hasRemote ? ICON_SIZE * 2 + 2 : ICON_SIZE } }, pref.hasLocal && /* @__PURE__ */ import_react7.default.createElement(IconMonitor, null), pref.hasRemote && /* @__PURE__ */ import_react7.default.createElement(IconCloud, null)),
      pref.cls === "rc-tag" && /* @__PURE__ */ import_react7.default.createElement(IconTag, null)
    );
  }
  function CommitGraph({
    commits,
    selectedHash,
    onSelectCommit,
    searchQuery,
    currentBranch,
    onCherryPick,
    onRevert,
    onReset,
    onCreateTag,
    onCreateBranchAt,
    onCheckoutBranch,
    onInteractiveRebase,
    onCheckoutCommit,
    onEditMessage,
    onCompareWorking,
    onDropCommit,
    onMoveCommit,
    onBranchDrop,
    wipCount = 0,
    conflictMode = null,
    githubRepo = null,
    loading = false,
    onSearchMatches,
    onMergeBranch,
    onRebaseCurrentOnto,
    onRenameBranch,
    onDeleteBranch,
    onPushBranch,
    onSetUpstream,
    onDeleteRemoteBranch,
    onPushTag,
    onDeleteTag,
    onDeleteRemoteTag
  }) {
    const { t } = useLang();
    const { getBool, get } = useSettings();
    const showAvatars = getBool("graphShowAvatars", true);
    const showAuthor = getBool("graphShowAuthor", true);
    const showDate = getBool("graphShowDate", true);
    const showSha = getBool("graphShowSha", true);
    const dateFormat = get("dateFormat", "relative");
    const bodyRef = (0, import_react7.useRef)(null);
    const containerRef = (0, import_react7.useRef)(null);
    const [containerW, setContainerW] = (0, import_react7.useState)(0);
    (0, import_react7.useEffect)(() => {
      const el = containerRef.current;
      if (!el)
        return;
      const ro = new ResizeObserver((entries) => setContainerW(entries[0].contentRect.width));
      ro.observe(el);
      return () => ro.disconnect();
    }, []);
    const hasWipNode = wipCount > 0 || conflictMode !== null;
    const headHash = (0, import_react7.useMemo)(() => {
      const h = commits.find((c) => c.refs.some((r) => r.includes("HEAD ->") && r.includes(currentBranch)));
      return h?.hash ?? commits[0]?.hash;
    }, [commits, currentBranch]);
    const layout = (0, import_react7.useMemo)(() => {
      if (!hasWipNode)
        return computeGraphLayout(commits);
      const wipMessage = conflictMode ? `\u26A0\uFE0F A file conflict was found when attempting to ${conflictMode}` : `//WIP  \u270F ${wipCount} fichier${wipCount !== 1 ? "s" : ""} modifi\xE9${wipCount !== 1 ? "s" : ""}`;
      const wip = {
        hash: WIP_HASH,
        shortHash: "WIP",
        message: wipMessage,
        author: "",
        authorEmail: "",
        date: "",
        parents: headHash ? [headHash] : [],
        refs: []
      };
      return computeGraphLayout([wip, ...commits]);
    }, [commits, hasWipNode, headHash, conflictMode, wipCount]);
    const [ctx, setCtx] = (0, import_react7.useState)(null);
    const [branchCtx, setBranchCtx] = (0, import_react7.useState)(null);
    const [dragBranch, setDragBranch] = (0, import_react7.useState)(null);
    const [dragOverRow, setDragOverRow] = (0, import_react7.useState)(null);
    const [drop, setDrop] = (0, import_react7.useState)(null);
    const [refExpand, setRefExpand] = (0, import_react7.useState)(null);
    const refExpandTimer = (0, import_react7.useRef)(null);
    const hoverDelayTimer = (0, import_react7.useRef)(null);
    const [refsColWRaw, startResizeRefs] = useColResize("cg-refs-w", 164, 80);
    const [authorColW, startResizeAuthor] = useColResize("cg-author-w", 140, 80);
    const [dateColW, startResizeDate] = useColResize("cg-date-w", 100, 70);
    const [shaColW, startResizeSha] = useColResize("cg-sha-w", 62, 50);
    const measured = containerW > 0;
    const refsColW = measured && containerW < 480 ? Math.min(refsColWRaw, 110) : refsColWRaw;
    const displayLayout = (0, import_react7.useMemo)(() => {
      if (!hasWipNode)
        return layout;
      return layout.map((c) => {
        if (c.hash !== WIP_HASH)
          return c;
        const wipColor = conflictMode ? "#ffa657" : c.color;
        const edges = c.edges.map((e) => ({ ...e, color: "#484f58", dashed: true }));
        if (conflictMode) {
          const incoming = layout.find((x) => x.hash !== WIP_HASH && x.hash !== headHash);
          if (incoming) {
            edges.push({
              fromLane: c.lane,
              toLane: incoming.lane,
              toRow: incoming.row,
              color: wipColor,
              type: incoming.lane < c.lane ? "merge-left" : "merge-right",
              dashed: true
            });
          }
        }
        return { ...c, color: wipColor, edges };
      });
    }, [layout, hasWipNode, conflictMode, headHash]);
    (0, import_react7.useEffect)(() => {
      if (!selectedHash)
        return;
      const row = displayLayout.find((c) => c.hash === selectedHash)?.row;
      const body = bodyRef.current;
      if (row == null || !body)
        return;
      const top = row * ROW_HEIGHT;
      if (top < body.scrollTop || top + ROW_HEIGHT > body.scrollTop + body.clientHeight) {
        body.scrollTo({ top: Math.max(0, top - body.clientHeight / 2), behavior: "smooth" });
      }
    }, [selectedHash]);
    (0, import_react7.useEffect)(() => {
      const onKey = (e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Escape")
          return;
        const el = document.activeElement;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
          return;
        if (ctx || drop)
          return;
        if (document.querySelector('[class$="-overlay"], [class*="-overlay "]'))
          return;
        if (displayLayout.length === 0)
          return;
        const idx = displayLayout.findIndex((c) => c.hash === selectedHash);
        if (e.key === "Escape") {
          if (idx !== -1)
            onSelectCommit(displayLayout[idx]);
          return;
        }
        const next = idx === -1 ? 0 : idx + (e.key === "ArrowDown" ? 1 : -1);
        if (next < 0 || next >= displayLayout.length)
          return;
        e.preventDefault();
        onSelectCommit(displayLayout[next]);
        const body = bodyRef.current;
        if (body) {
          const top = next * ROW_HEIGHT;
          if (top < body.scrollTop)
            body.scrollTop = top;
          else if (top + ROW_HEIGHT > body.scrollTop + body.clientHeight) {
            body.scrollTop = top + ROW_HEIGHT - body.clientHeight;
          }
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [displayLayout, selectedHash, onSelectCommit, ctx, drop]);
    const maxLane = (0, import_react7.useMemo)(() => displayLayout.reduce((m, c) => Math.max(m, c.lane), 0), [displayLayout]);
    const svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 48);
    const svgH = displayLayout.length * ROW_HEIGHT;
    const MSG_MIN = 170;
    let colBudget = measured ? containerW - refsColW - svgW - MSG_MIN : Infinity;
    const effShowSha = showSha && colBudget >= shaColW;
    if (effShowSha)
      colBudget -= shaColW;
    const effShowDate = showDate && colBudget >= dateColW;
    if (effShowDate)
      colBudget -= dateColW;
    const effShowAuthor = showAuthor && colBudget >= authorColW;
    const filtered = (0, import_react7.useMemo)(() => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return new Set(
          displayLayout.filter((c) => c.hash !== WIP_HASH && (c.message.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) || c.shortHash.includes(q))).map((c) => c.row)
        );
      }
      return null;
    }, [displayLayout, searchQuery]);
    (0, import_react7.useEffect)(() => {
      onSearchMatches?.(searchQuery ? filtered?.size ?? 0 : -1);
    }, [filtered, searchQuery, onSearchMatches]);
    const [hoverHash, setHoverHash] = (0, import_react7.useState)(null);
    const hoverHighlight = (0, import_react7.useMemo)(() => {
      if (!hoverHash)
        return null;
      const byHash = new Map(displayLayout.map((c) => [c.hash, c]));
      const hovered = byHash.get(hoverHash);
      if (!hovered || hovered.hash === WIP_HASH)
        return null;
      const isLocalBranchRef = (r) => !r.startsWith("tag:") && !r.includes("origin/") && !r.includes("remotes/");
      const rows = /* @__PURE__ */ new Set();
      let cur = hovered;
      const seen = /* @__PURE__ */ new Set();
      while (cur && !seen.has(cur.hash)) {
        seen.add(cur.hash);
        if (cur.hash !== WIP_HASH)
          rows.add(cur.row);
        const fp = cur.parents[0];
        const next = fp ? byHash.get(fp) : void 0;
        if (!next)
          break;
        if (next.refs.some(isLocalBranchRef))
          break;
        cur = next;
      }
      return rows.size ? rows : null;
    }, [hoverHash, displayLayout]);
    const renderEdge = (0, import_react7.useCallback)((commit, edge) => {
      const isWip = commit.hash === WIP_HASH;
      const x1 = SVG_PAD_L + edge.fromLane * LANE_WIDTH;
      const y1 = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = SVG_PAD_L + edge.toLane * LANE_WIDTH;
      const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const key = `${commit.hash}-${edge.fromLane}-${edge.toLane}-${edge.toRow}`;
      const dashArray = isWip || edge.dashed ? "4 3" : void 0;
      if (x1 === x2) {
        return /* @__PURE__ */ import_react7.default.createElement(
          "line",
          {
            key,
            x1,
            y1,
            x2,
            y2,
            stroke: edge.color,
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeDasharray: dashArray
          }
        );
      }
      if (isWip) {
        const r2 = LANE_WIDTH * 0.6;
        const dx2 = x2 > x1 ? r2 : -r2;
        const d2 = [
          `M${x1} ${y1}`,
          `Q${x1} ${y1 + r2} ${x1 + dx2} ${y1 + r2}`,
          `L${x2 - dx2} ${y1 + r2}`,
          `Q${x2} ${y1 + r2} ${x2} ${y1 + 2 * r2}`,
          `L${x2} ${y2}`
        ].join(" ");
        return /* @__PURE__ */ import_react7.default.createElement(
          "path",
          {
            key,
            d: d2,
            fill: "none",
            stroke: edge.color,
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeDasharray: dashArray
          }
        );
      }
      const r = Math.min(LANE_WIDTH * 0.6, Math.abs(y2 - y1) / 2);
      const dx = x2 > x1 ? r : -r;
      const isFork = edge.type === "fork-left" || edge.type === "fork-right";
      const d = isFork ? [
        `M${x1} ${y1}`,
        `L${x1} ${y2 - r}`,
        `Q${x1} ${y2} ${x1 + dx} ${y2}`,
        `L${x2} ${y2}`
      ].join(" ") : [
        `M${x1} ${y1}`,
        `L${x2 - dx} ${y1}`,
        `Q${x2} ${y1} ${x2} ${y1 + r}`,
        `L${x2} ${y2}`
      ].join(" ");
      return /* @__PURE__ */ import_react7.default.createElement(
        "path",
        {
          key,
          d,
          fill: "none",
          stroke: edge.color,
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeDasharray: dashArray
        }
      );
    }, []);
    const buildMenuItems = (0, import_react7.useCallback)((commit) => {
      const isHead = commit.refs.some((r) => r.includes("HEAD ->") && r.includes(currentBranch));
      return [
        { label: t("graph.menu.checkout"), action: () => onCheckoutCommit?.(commit.hash) },
        { separator: true },
        { label: t("graph.menu.createBranch"), action: () => onCreateBranchAt(commit.hash) },
        { label: t("graph.menu.createTag"), action: () => onCreateTag(commit.hash) },
        { separator: true },
        { label: t("graph.menu.interactiveRebase"), action: () => onInteractiveRebase?.(commit.hash) },
        ...isHead ? [{ label: t("graph.menu.editMessage"), action: () => onEditMessage?.(commit.hash) }] : [],
        { label: t("graph.menu.cherryPick"), action: () => onCherryPick(commit.hash), disabled: isHead },
        { label: t("graph.menu.revert"), action: () => onRevert(commit.hash) },
        { label: t("graph.menu.dropCommit"), action: () => onDropCommit?.(commit.hash), danger: true },
        { label: t("graph.menu.moveUp"), action: () => onMoveCommit?.(commit.hash, "up") },
        { label: t("graph.menu.moveDown"), action: () => onMoveCommit?.(commit.hash, "down") },
        { separator: true },
        { label: t("graph.menu.resetSoft"), action: () => onReset(commit.hash, "soft") },
        { label: t("graph.menu.resetMixed"), action: () => onReset(commit.hash, "mixed") },
        { label: t("graph.menu.resetHard"), action: () => onReset(commit.hash, "hard"), danger: true },
        { separator: true },
        { label: t("graph.menu.copyShortHash"), action: () => navigator.clipboard.writeText(commit.shortHash) },
        { label: t("graph.menu.copyFullHash"), action: () => navigator.clipboard.writeText(commit.hash) },
        { label: t("graph.menu.copyMessage"), action: () => navigator.clipboard.writeText(commit.message) },
        { separator: true },
        { label: t("graph.menu.compareWorking"), action: () => onCompareWorking?.(commit.hash) }
      ];
    }, [
      currentBranch,
      onCherryPick,
      onRevert,
      onReset,
      onCreateTag,
      onCreateBranchAt,
      onInteractiveRebase,
      onCheckoutCommit,
      onEditMessage,
      onCompareWorking,
      onDropCommit,
      onMoveCommit,
      t
    ]);
    const handleRowContextMenu = (0, import_react7.useCallback)((e, commit) => {
      if (commit.hash === WIP_HASH)
        return;
      e.preventDefault();
      e.stopPropagation();
      setCtx({ x: e.clientX, y: e.clientY, commit });
    }, []);
    const handleRowDrop = (0, import_react7.useCallback)((e, commit) => {
      e.preventDefault();
      setDragOverRow(null);
      const branch = dragBranch ?? e.dataTransfer.getData("text/plain");
      setDragBranch(null);
      if (!branch || commit.hash === WIP_HASH)
        return;
      setDrop({ x: e.clientX, y: e.clientY, hash: commit.hash, branch });
    }, [dragBranch]);
    const buildDropItems = (0, import_react7.useCallback)((d) => {
      const short = d.hash.slice(0, 7);
      return [
        { label: t("graph.drop.reset", d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, "reset"), danger: true },
        { label: t("graph.drop.rebase", d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, "rebase") },
        { label: t("graph.drop.merge", d.branch, short), action: () => onBranchDrop?.(d.branch, d.hash, "merge") }
      ];
    }, [onBranchDrop, t]);
    const buildBranchMenu = (0, import_react7.useCallback)((pref) => {
      const items = [];
      const name = pref.branchName;
      if (pref.cls === "rc-tag") {
        const tag = pref.display;
        items.push({ label: "\u{1F4CB} Copier le nom", action: () => navigator.clipboard.writeText(tag) });
        if (onPushTag)
          items.push({ label: "\u2B06 Pousser le tag", action: () => onPushTag(tag) });
        if (onDeleteTag || onDeleteRemoteTag)
          items.push({ separator: true });
        if (onDeleteTag)
          items.push({ label: "\u{1F5D1} Supprimer (local)", action: () => onDeleteTag(tag), danger: true });
        if (onDeleteRemoteTag)
          items.push({ label: "\u{1F5D1} Supprimer (distant)", action: () => onDeleteRemoteTag(tag), danger: true });
        return items;
      }
      if (pref.cls === "rc-remote" && name) {
        if (onCheckoutBranch)
          items.push({ label: "\u2713 Checkout", action: () => onCheckoutBranch(name) });
        if (onDeleteRemoteBranch)
          items.push({ label: "\u{1F5D1} Supprimer la branche distante", action: () => onDeleteRemoteBranch(name), danger: true });
        items.push({ label: "\u{1F4CB} Copier le nom", action: () => navigator.clipboard.writeText(pref.display) });
        return items;
      }
      if (!name)
        return items;
      if (!pref.isHead && onCheckoutBranch)
        items.push({ label: "\u2713 Checkout", action: () => onCheckoutBranch(name) });
      if (!pref.isHead && onMergeBranch && currentBranch)
        items.push({ label: `\u26D9 Merger dans ${currentBranch}`, action: () => onMergeBranch(name) });
      if (!pref.isHead && onRebaseCurrentOnto && currentBranch)
        items.push({ label: `\u2935 Rebaser ${currentBranch} sur ${pref.display}`, action: () => onRebaseCurrentOnto(name) });
      if (items.length)
        items.push({ separator: true });
      if (onPushBranch)
        items.push({ label: "\u2B06 Push", action: () => onPushBranch(name) });
      if (onSetUpstream)
        items.push({ label: "\u{1F517} D\xE9finir l'upstream", action: () => onSetUpstream(name) });
      if (onRenameBranch)
        items.push({ label: "\u270F\uFE0F Renommer", action: () => onRenameBranch(name) });
      items.push({ label: "\u{1F4CB} Copier le nom", action: () => navigator.clipboard.writeText(name) });
      if (!pref.isHead && onDeleteBranch) {
        items.push({ separator: true });
        items.push({ label: "\u{1F5D1} Supprimer", action: () => onDeleteBranch(name), danger: true });
      }
      return items;
    }, [
      currentBranch,
      onCheckoutBranch,
      onMergeBranch,
      onRebaseCurrentOnto,
      onPushBranch,
      onSetUpstream,
      onRenameBranch,
      onDeleteBranch,
      onDeleteRemoteBranch,
      onPushTag,
      onDeleteTag,
      onDeleteRemoteTag
    ]);
    return /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-container", ref: containerRef }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-header" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-h-refs", style: { width: refsColW } }, "BRANCH / TAG"), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-handle", onMouseDown: startResizeRefs }), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-h-graph", style: { width: svgW } }, "GRAPH"), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-h-msg" }, "COMMIT MESSAGE"), effShowAuthor && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-handle", onMouseDown: startResizeAuthor }), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-h-author", style: { width: authorColW } }, "AUTHOR")), effShowDate && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-handle", onMouseDown: startResizeDate }), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-h-date", style: { width: dateColW } }, "DATE")), effShowSha && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-handle", onMouseDown: startResizeSha }), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-h-sha", style: { width: shaColW } }, "SHA"))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-body", ref: bodyRef }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-scroll-content", style: { height: svgH, position: "relative" } }, /* @__PURE__ */ import_react7.default.createElement(
      "svg",
      {
        className: "cg-graph-svg",
        width: svgW,
        height: svgH,
        style: {
          position: "absolute",
          left: refsColW,
          top: 0,
          pointerEvents: "none",
          zIndex: 2,
          overflow: "visible"
        }
      },
      displayLayout.map((commit) => {
        if (commit.hash === WIP_HASH)
          return null;
        const cx = SVG_PAD_L + commit.lane * LANE_WIDTH;
        const bandH = 24;
        const y = commit.row * ROW_HEIGHT + (ROW_HEIGHT - bandH) / 2;
        const right = svgW - SVG_PAD_R;
        const w = Math.max(right - cx, 0);
        if (w <= 0)
          return null;
        const edgeW = 2;
        return /* @__PURE__ */ import_react7.default.createElement("g", { key: `band-${commit.hash}` }, /* @__PURE__ */ import_react7.default.createElement("rect", { x: cx, y, width: w, height: bandH, fill: commit.color, opacity: 0.14 }), /* @__PURE__ */ import_react7.default.createElement("rect", { x: right - edgeW, y, width: edgeW, height: bandH, fill: commit.color, opacity: 0.7 }));
      }),
      displayLayout.map((commit) => {
        if (commit.hash === WIP_HASH || commit.refs.length === 0)
          return null;
        const cx = SVG_PAD_L + commit.lane * LANE_WIDTH;
        const cy = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2;
        if (cx - NODE_RADIUS <= 0)
          return null;
        return /* @__PURE__ */ import_react7.default.createElement(
          "line",
          {
            key: `conn-${commit.hash}`,
            x1: 0,
            y1: cy,
            x2: cx - NODE_RADIUS,
            y2: cy,
            stroke: dimColor(commit.color),
            strokeWidth: 1.5
          }
        );
      }),
      displayLayout.flatMap((commit) => commit.edges.map((edge) => renderEdge(commit, edge))),
      displayLayout.map((commit) => {
        const cx = SVG_PAD_L + commit.lane * LANE_WIDTH;
        const cy = commit.row * ROW_HEIGHT + ROW_HEIGHT / 2;
        const isSelected = commit.hash === selectedHash;
        const isWip = commit.hash === WIP_HASH;
        if (isWip) {
          if (conflictMode) {
            return /* @__PURE__ */ import_react7.default.createElement("g", { key: "wip" }, /* @__PURE__ */ import_react7.default.createElement("circle", { cx, cy, r: NODE_RADIUS + 2, fill: "#161b22" }), /* @__PURE__ */ import_react7.default.createElement(
              "circle",
              {
                cx,
                cy,
                r: NODE_RADIUS,
                fill: "#ffa657",
                stroke: "#ffa657",
                strokeWidth: 1.5
              }
            ), /* @__PURE__ */ import_react7.default.createElement(
              "text",
              {
                x: cx,
                y: cy,
                dy: ".35em",
                textAnchor: "middle",
                fontSize: 10,
                fontWeight: "900",
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                fill: "#161b22"
              },
              "!"
            ));
          }
          return /* @__PURE__ */ import_react7.default.createElement("g", { key: "wip" }, /* @__PURE__ */ import_react7.default.createElement(
            "circle",
            {
              cx,
              cy,
              r: NODE_RADIUS,
              fill: "#161b22",
              stroke: "#6e7681",
              strokeWidth: 1.5,
              strokeDasharray: "3 2"
            }
          ), /* @__PURE__ */ import_react7.default.createElement(
            "text",
            {
              x: cx,
              y: cy,
              dy: ".35em",
              textAnchor: "middle",
              fontSize: 6,
              fontWeight: "700",
              fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              fill: "#6e7681"
            },
            "WIP"
          ));
        }
        const init = initials(commit.author);
        const isMerge = commit.parents.length >= 2;
        return /* @__PURE__ */ import_react7.default.createElement("g", { key: commit.hash }, isSelected && /* @__PURE__ */ import_react7.default.createElement(
          "circle",
          {
            cx,
            cy,
            r: NODE_RADIUS + 3,
            fill: "none",
            stroke: commit.color,
            strokeWidth: 1.5,
            opacity: 0.5
          }
        ), isMerge ? (
          /* Merge commit: small plain dot (de-emphasized, GitKraken-style) */
          /* @__PURE__ */ import_react7.default.createElement(
            "circle",
            {
              cx,
              cy,
              r: 5,
              fill: commit.color,
              stroke: "#161b22",
              strokeWidth: 2
            }
          )
        ) : showAvatars ? (
          /* Normal commit: author avatar */
          /* @__PURE__ */ import_react7.default.createElement(
            NodeAvatar,
            {
              cx,
              cy,
              r: NODE_RADIUS,
              email: commit.authorEmail,
              name: commit.author,
              sha: commit.hash,
              color: commit.color,
              clipId: `node-clip-${commit.hash}`
            }
          )
        ) : (
          /* Avatars off: colored circle with initials */
          /* @__PURE__ */ import_react7.default.createElement("g", null, /* @__PURE__ */ import_react7.default.createElement("circle", { cx, cy, r: NODE_RADIUS, fill: commit.color }), /* @__PURE__ */ import_react7.default.createElement(
            "text",
            {
              x: cx,
              y: cy,
              dy: ".35em",
              textAnchor: "middle",
              fontSize: 8,
              fontWeight: "700",
              fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              fill: "#ffffff"
            },
            init
          ))
        ));
      })
    ), displayLayout.map((commit) => {
      const isSelected = commit.hash === selectedHash;
      const isWip = commit.hash === WIP_HASH;
      const keep = filtered ?? hoverHighlight;
      const isDimmed = !isWip && keep !== null && !keep.has(commit.row);
      const isDropTarget = dragOverRow === commit.row && !isWip;
      const prefs = processRefs(commit.refs);
      const primary = prefs[0];
      const stackCount = prefs.length - 1;
      return /* @__PURE__ */ import_react7.default.createElement(
        "div",
        {
          key: commit.hash,
          className: `cg-row ${isSelected ? "cg-selected" : ""} ${isDimmed ? "cg-dimmed" : ""} ${isWip ? "cg-row-wip" : ""} ${isDropTarget ? "cg-drop-target" : ""}`,
          style: { top: commit.row * ROW_HEIGHT },
          onClick: () => onSelectCommit(commit),
          onContextMenu: (e) => handleRowContextMenu(e, commit),
          onDragOver: (e) => {
            if (!dragBranch || isWip)
              return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOverRow !== commit.row)
              setDragOverRow(commit.row);
          },
          onDrop: (e) => handleRowDrop(e, commit)
        },
        /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-color-bar", style: { background: isWip ? "#484f58" : commit.color } }),
        /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-refs-col", style: { width: refsColW } }, primary ? /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement(
          "div",
          {
            className: "cg-refs-chips",
            onMouseEnter: (e) => {
              if (hoverDelayTimer.current)
                clearTimeout(hoverDelayTimer.current);
              hoverDelayTimer.current = setTimeout(() => setHoverHash(commit.hash), 1e3);
              if (stackCount < 1)
                return;
              if (refExpandTimer.current)
                clearTimeout(refExpandTimer.current);
              if (refExpand?.row !== commit.row) {
                setRefExpand({ row: commit.row, rect: e.currentTarget.getBoundingClientRect() });
              }
            },
            onMouseLeave: () => {
              if (hoverDelayTimer.current) {
                clearTimeout(hoverDelayTimer.current);
                hoverDelayTimer.current = null;
              }
              setHoverHash(null);
              refExpandTimer.current = setTimeout(() => setRefExpand(null), 120);
            }
          },
          /* @__PURE__ */ import_react7.default.createElement(
            RefChip,
            {
              pref: primary,
              laneColor: commit.color,
              onDoubleClick: onCheckoutBranch,
              onDragStartBranch: setDragBranch,
              onDragEndBranch: () => {
                setDragBranch(null);
                setDragOverRow(null);
              },
              onContextMenu: (e, pref) => setBranchCtx({ x: e.clientX, y: e.clientY, pref })
            }
          ),
          stackCount > 0 && refExpand?.row !== commit.row && /* @__PURE__ */ import_react7.default.createElement("span", { className: "rc-stack-badge" }, "+", stackCount)
        ), /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-ref-line-stub", style: { background: dimColor(commit.color) } })) : null),
        /* @__PURE__ */ import_react7.default.createElement("div", { style: { width: svgW, flexShrink: 0 } }),
        /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-msg" }, !isWip && sigBadge(commit.signature), /* @__PURE__ */ import_react7.default.createElement("span", { className: `cg-msg ${isWip ? "cg-msg-wip" : ""}`, title: isWip ? void 0 : commit.message }, isWip ? commit.message : linkifyIssues(commit.message, githubRepo))),
        effShowAuthor && !isWip && /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-author", style: { width: authorColW } }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "cg-author-name" }, commit.author)),
        effShowAuthor && isWip && /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-author", style: { width: authorColW } }),
        effShowDate && /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-date", style: { width: dateColW } }, !isWip ? fmtDate(commit.date, dateFormat) : ""),
        effShowSha && /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-col-sha", style: { width: shaColW } }, !isWip && /* @__PURE__ */ import_react7.default.createElement("code", null, commit.shortHash))
      );
    })), displayLayout.length === 0 && (loading ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-skeleton" }, Array.from({ length: 14 }).map((_, i) => /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-skel-row", key: i, style: { animationDelay: `${i * 60}ms` } }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "cg-skel-chip", style: { width: i % 4 === 0 ? 70 : 0 } }), /* @__PURE__ */ import_react7.default.createElement("span", { className: "cg-skel-dot", style: { marginLeft: 12 + i % 3 * 18 } }), /* @__PURE__ */ import_react7.default.createElement("span", { className: "cg-skel-bar", style: { width: `${38 + i * 23 % 42}%` } })))) : /* @__PURE__ */ import_react7.default.createElement("div", { className: "cg-empty" }, commits.length === 0 ? t("graph.emptyRepo") : t("graph.empty")))), ctx && /* @__PURE__ */ import_react7.default.createElement(
      ContextMenu,
      {
        x: ctx.x,
        y: ctx.y,
        items: buildMenuItems(ctx.commit),
        onClose: () => setCtx(null)
      }
    ), drop && /* @__PURE__ */ import_react7.default.createElement(
      ContextMenu,
      {
        x: drop.x,
        y: drop.y,
        items: buildDropItems(drop),
        onClose: () => setDrop(null)
      }
    ), branchCtx && (() => {
      const items = buildBranchMenu(branchCtx.pref);
      if (items.length === 0) {
        return null;
      }
      return /* @__PURE__ */ import_react7.default.createElement(
        ContextMenu,
        {
          x: branchCtx.x,
          y: branchCtx.y,
          items,
          onClose: () => setBranchCtx(null)
        }
      );
    })(), refExpand && (() => {
      const expandCommit = displayLayout.find((c) => c.row === refExpand.row);
      if (!expandCommit)
        return null;
      const allPrefs = processRefs(expandCommit.refs);
      const hiddenPrefs = allPrefs.slice(1);
      if (hiddenPrefs.length === 0)
        return null;
      const { rect } = refExpand;
      const top = rect.bottom + 4;
      const left = rect.left;
      return (0, import_react_dom3.createPortal)(
        /* @__PURE__ */ import_react7.default.createElement(
          "div",
          {
            className: "ref-expansion-popup",
            style: { position: "fixed", left, top, zIndex: 9998, minWidth: rect.width, width: "max-content" },
            onMouseEnter: () => {
              if (refExpandTimer.current)
                clearTimeout(refExpandTimer.current);
            },
            onMouseLeave: () => {
              refExpandTimer.current = setTimeout(() => setRefExpand(null), 120);
            }
          },
          hiddenPrefs.map((p, i) => /* @__PURE__ */ import_react7.default.createElement(
            RefChip,
            {
              key: i,
              pref: p,
              laneColor: expandCommit.color,
              onDoubleClick: onCheckoutBranch,
              onDragStartBranch: setDragBranch,
              onDragEndBranch: () => {
                setDragBranch(null);
                setDragOverRow(null);
              },
              onContextMenu: (e, pref) => setBranchCtx({ x: e.clientX, y: e.clientY, pref })
            }
          ))
        ),
        document.body
      );
    })());
  }

  // ../src/renderer/src/components/RightPanel/RightPanel.tsx
  var import_react8 = __toESM(require_react());
  function buildTree(files) {
    const root = { name: "", fullPath: "", isFile: false, children: [] };
    for (const f of files) {
      const parts = f.path.split("/");
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        let child = node.children.find((c) => c.name === parts[i]);
        if (!child) {
          child = { name: parts[i], fullPath: parts.slice(0, i + 1).join("/"), isFile: isLast, status: isLast ? f.status : void 0, children: [] };
          node.children.push(child);
        }
        node = child;
      }
    }
    return root.children;
  }
  var TreePencil = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "#e3b341", style: { flexShrink: 0 } }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" }));
  function treeStats(node) {
    if (node.isFile) {
      const s = node.status ?? "M";
      return { mod: s !== "A" && s !== "D" ? 1 : 0, add: s === "A" ? 1 : 0, del: s === "D" ? 1 : 0 };
    }
    return node.children.reduce((acc, c) => {
      const cs = treeStats(c);
      return { mod: acc.mod + cs.mod, add: acc.add + cs.add, del: acc.del + cs.del };
    }, { mod: 0, add: 0, del: 0 });
  }
  function TreeFileRow({ node, depth, onAction, actionIcon, actionTitle, onSelect, isSelected }) {
    const [open, setOpen] = import_react8.default.useState(true);
    const indent = depth * 10;
    if (node.isFile) {
      const s = node.status ?? "M";
      return /* @__PURE__ */ import_react8.default.createElement(
        "div",
        {
          className: `st-tr st-clickable ${isSelected ? "st-selected" : ""}`,
          style: { paddingLeft: indent + 4 },
          onClick: () => onSelect?.(node.fullPath)
        },
        s === "A" ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-fsi st-fsi-add" }, "+") : s === "D" ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-fsi st-fsi-del" }, "\u2212") : /* @__PURE__ */ import_react8.default.createElement(TreePencil, null),
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-tr-name" }, node.name),
        actionIcon && /* @__PURE__ */ import_react8.default.createElement(
          "button",
          {
            className: `st-action ${actionIcon === "+" ? "st-stage" : "st-unstage"}`,
            title: actionTitle,
            onClick: (e) => {
              e.stopPropagation();
              onAction([node.fullPath]);
            }
          },
          actionIcon
        )
      );
    }
    const allPaths = (n) => n.isFile ? [n.fullPath] : n.children.flatMap(allPaths);
    const stats = !open ? treeStats(node) : null;
    return /* @__PURE__ */ import_react8.default.createElement(import_react8.default.Fragment, null, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st-tr st-tr-dir", style: { paddingLeft: indent }, onClick: () => setOpen((o) => !o) }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-tr-tri" }, open ? "\u25BC" : "\u25B6"), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-tr-dirname" }, node.name), stats && /* @__PURE__ */ import_react8.default.createElement("div", { className: "st-tr-stats" }, stats.mod > 0 && /* @__PURE__ */ import_react8.default.createElement(import_react8.default.Fragment, null, /* @__PURE__ */ import_react8.default.createElement(TreePencil, null), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-stat-mod" }, stats.mod)), stats.add > 0 && /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-stat-add" }, "+", stats.add), stats.del > 0 && /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-stat-del" }, "\u2212", stats.del)), actionIcon && /* @__PURE__ */ import_react8.default.createElement(
      "button",
      {
        className: `st-action ${actionIcon === "+" ? "st-stage" : "st-unstage"}`,
        title: `${actionTitle} dossier`,
        onClick: (e) => {
          e.stopPropagation();
          onAction(allPaths(node));
        }
      },
      actionIcon
    )), open && node.children.map((c) => /* @__PURE__ */ import_react8.default.createElement(
      TreeFileRow,
      {
        key: c.fullPath,
        node: c,
        depth: depth + 1,
        onAction,
        actionIcon,
        actionTitle,
        onSelect,
        isSelected: isSelected && c.fullPath === node.fullPath
      }
    )));
  }
  function getAvatarColor(str) {
    const colors = ["#00bfff", "#ff6b6b", "#51cf66", "#ffd43b", "#cc5de8", "#ff922b", "#20c997", "#f06595"];
    let h = 0;
    for (const c of str)
      h = h * 31 + c.charCodeAt(0) & 4294967295;
    return colors[Math.abs(h) % colors.length];
  }
  function initials2(name) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }
  function GravatarAvatar({ email, name, sha, size = 36, radius = 6 }) {
    const aiLogo = aiAvatarDataUri(name, email);
    const [src, setSrc] = (0, import_react8.useState)(aiLogo);
    (0, import_react8.useEffect)(() => {
      if (aiLogo) {
        setSrc(aiLogo);
        return;
      }
      if (!email) {
        console.log("[avatar] no email for", name);
        return;
      }
      console.log("[avatar] resolving", email, sha ? `sha=${sha}` : "(no sha)");
      window.gitAPI.avatarResolve(email, sha).then((url) => {
        console.log("[avatar] resolved", email, "\u2192", url);
        setSrc(url);
      }).catch((err) => {
        console.warn("[avatar] resolve error", email, err);
      });
    }, [email, sha, aiLogo]);
    const base = { width: size, height: size, borderRadius: radius, flexShrink: 0 };
    if (src) {
      return /* @__PURE__ */ import_react8.default.createElement(
        "img",
        {
          src,
          alt: name,
          style: { ...base, objectFit: "cover", display: "block" },
          onError: () => {
            console.warn("[avatar] img load error, falling back to initials. src=", src);
            setSrc(null);
          }
        }
      );
    }
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: {
      ...base,
      background: getAvatarColor(email),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontWeight: 700,
      fontSize: size * 0.38
    } }, initials2(name));
  }
  function fmtDate2(s) {
    try {
      return new Date(s).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return s;
    }
  }
  var STATUS_META = {
    M: { label: "M", color: "#58a6ff" },
    A: { label: "A", color: "#3fb950" },
    D: { label: "D", color: "#f85149" },
    R: { label: "R", color: "#d2a8ff" },
    "!": { label: "!", color: "#ffa657" },
    "?": { label: "?", color: "#8b949e" }
  };
  function FileHistoryModal({ filepath, onClose, onSelectCommit }) {
    const { t } = useLang();
    const [history, setHistory] = (0, import_react8.useState)([]);
    const [loading, setLoading] = (0, import_react8.useState)(true);
    (0, import_react8.useEffect)(() => {
      setLoading(true);
      window.gitAPI.getFileHistory(filepath).then((r) => {
        setHistory(r.commits ?? []);
        setLoading(false);
      });
    }, [filepath]);
    return /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-overlay", onClick: (e) => e.target === e.currentTarget && onClose() }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-modal" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-header" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "fh-title" }, t("panel.fileHistory", filepath.split("/").pop() ?? "")), /* @__PURE__ */ import_react8.default.createElement("button", { className: "fh-close", onClick: onClose }, "\xD7")), /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-path" }, filepath), /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-list" }, loading && /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-empty" }, t("panel.loading")), !loading && history.length === 0 && /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-empty" }, t("panel.noHistory")), history.map((c) => /* @__PURE__ */ import_react8.default.createElement("div", { key: c.hash, className: "fh-row", onClick: () => {
      onSelectCommit(c.hash);
      onClose();
    } }, /* @__PURE__ */ import_react8.default.createElement("code", { className: "fh-hash" }, c.shortHash), /* @__PURE__ */ import_react8.default.createElement("div", { className: "fh-info" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "fh-msg" }, c.message), /* @__PURE__ */ import_react8.default.createElement("span", { className: "fh-meta" }, c.author, " \xB7 ", fmtDate2(c.date))))))));
  }
  function hashToColor(hash) {
    let n = 0;
    for (let i = 0; i < 6; i++)
      n = n * 16 + parseInt(hash[i], 16);
    const hue = n % 360;
    return `hsl(${hue}, 55%, 28%)`;
  }
  function BlameView({ commitHash, filepath, onSelectCommit }) {
    const { t } = useLang();
    const [lines, setLines] = (0, import_react8.useState)([]);
    const [loading, setLoading] = (0, import_react8.useState)(true);
    (0, import_react8.useEffect)(() => {
      setLoading(true);
      window.gitAPI.getBlame(commitHash, filepath).then((r) => {
        setLines(r.lines ?? []);
        setLoading(false);
      });
    }, [commitHash, filepath]);
    if (loading)
      return /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-blame-loading" }, t("panel.loadingBlame"));
    if (!lines.length)
      return /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-blame-loading" }, t("panel.noBlame"));
    return /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-blame-container" }, /* @__PURE__ */ import_react8.default.createElement("table", { className: "rp-blame-table" }, /* @__PURE__ */ import_react8.default.createElement("tbody", null, lines.map((line, i) => {
      const prevHash = lines[i - 1]?.hash;
      const isNewBlock = line.hash !== prevHash;
      const bg = hashToColor(line.hash);
      return /* @__PURE__ */ import_react8.default.createElement("tr", { key: i, className: "rp-blame-row" }, /* @__PURE__ */ import_react8.default.createElement(
        "td",
        {
          className: "rp-blame-meta",
          style: { background: bg, opacity: isNewBlock ? 1 : 0.6 }
        },
        isNewBlock ? /* @__PURE__ */ import_react8.default.createElement(import_react8.default.Fragment, null, /* @__PURE__ */ import_react8.default.createElement(
          "span",
          {
            className: "rp-blame-hash",
            onClick: () => onSelectCommit(line.hash),
            title: `${line.hash}
${line.author}
${line.date}`
          },
          line.shortHash
        ), /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-blame-author" }, line.author.split(" ")[0]), /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-blame-date" }, line.date)) : null
      ), /* @__PURE__ */ import_react8.default.createElement("td", { className: "rp-blame-linenum" }, line.lineNum), /* @__PURE__ */ import_react8.default.createElement("td", { className: "rp-blame-content" }, /* @__PURE__ */ import_react8.default.createElement("code", null, line.content)));
    }))));
  }
  function formatPath(path) {
    const parts = path.split("/");
    const name = parts.pop() ?? path;
    const dir = parts.join("/");
    if (!dir)
      return { dir: "", name };
    const MAX = 26;
    return { dir: (dir.length > MAX ? dir.slice(0, MAX - 1) + "\u2026" : dir) + "/", name };
  }
  var MIN_MSG_H = 48;
  var MAX_MSG_H = 400;
  function CommitDetail({ commit, onSelectCommit, wipCount, onViewWip, onOpenFileDiff, onAmendSuccess, githubRepo }) {
    const { t } = useLang();
    const [files, setFiles] = (0, import_react8.useState)([]);
    const [body, setBody] = (0, import_react8.useState)("");
    const [selectedFile, setSelectedFile] = (0, import_react8.useState)(null);
    const [view, setView] = (0, import_react8.useState)("files");
    const [cdTreeMode, setCdTreeMode] = (0, import_react8.useState)(() => localStorage.getItem("cd-tree-mode") === "true");
    const [fileHistoryPath, setFileHistoryPath] = (0, import_react8.useState)(null);
    const [viewAll, setViewAll] = (0, import_react8.useState)(false);
    const [msgHeight, setMsgHeight] = (0, import_react8.useState)(120);
    const [amendEditing, setAmendEditing] = (0, import_react8.useState)(false);
    const [amendMsg, setAmendMsg] = (0, import_react8.useState)("");
    const [amendLoading, setAmendLoading] = (0, import_react8.useState)(false);
    const dragRef = (0, import_react8.useRef)(null);
    const onResizeMouseDown = (0, import_react8.useCallback)((e) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: msgHeight };
      const onMove = (ev) => {
        if (!dragRef.current)
          return;
        const delta = ev.clientY - dragRef.current.startY;
        const newH = Math.min(MAX_MSG_H, Math.max(MIN_MSG_H, dragRef.current.startH + delta));
        setMsgHeight(newH);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }, [msgHeight]);
    (0, import_react8.useEffect)(() => {
      setFiles([]);
      setBody("");
      setSelectedFile(null);
      setView("files");
      setAmendEditing(false);
      setAmendMsg("");
      setAmendLoading(false);
      Promise.all([
        window.gitAPI.getCommitFiles(commit.hash),
        window.gitAPI.getCommitBody(commit.hash)
      ]).then(([fr2, br]) => {
        setFiles(fr2.files ?? []);
        setBody(br.body ?? "");
      });
    }, [commit.hash]);
    const parentShort = commit.parents?.[0]?.slice(0, 7) ?? null;
    const isHeadCommit = commit.refs.some((r) => r.includes("HEAD"));
    const coAuthors = body ? [...body.matchAll(/Co-Authored-By:\s*(.+?)\s*<([^>]+)>/gi)].map((m) => ({ name: m[1].trim(), email: m[2].trim() })) : [];
    const cleanBody = body ? body.replace(/^Co-Authored-By:.*$/gim, "").trim() : "";
    return /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-content" }, wipCount != null && wipCount > 0 && /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-wip-banner" }, /* @__PURE__ */ import_react8.default.createElement("span", null, wipCount, " fichier", wipCount !== 1 ? "s" : "", " modifi\xE9", wipCount !== 1 ? "s" : "", " en cours"), /* @__PURE__ */ import_react8.default.createElement("button", { className: "cd-view-change-btn", onClick: onViewWip }, "Voir les changements")), /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-top-row" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-hash-info" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-label" }, "commit:"), /* @__PURE__ */ import_react8.default.createElement(
      "code",
      {
        className: "cd-hash",
        onClick: () => navigator.clipboard.writeText(commit.hash),
        title: t("panel.copyHash")
      },
      commit.shortHash
    )), /* @__PURE__ */ import_react8.default.createElement("button", { className: "cd-ai-btn" }, /* @__PURE__ */ import_react8.default.createElement("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-6.5 6.5a1.516 1.516 0 0 1-2.56-1.31L5.811 10.5H3.688c-1.57 0-2.347-1.909-1.22-3.004l6.5-6.5.536-.565z" })), /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-ai-label" }, "Recompose commit with AI"), /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-ai-sep" }), /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-ai-arrow" }, "\u25BC"))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-scroll" }, /* @__PURE__ */ import_react8.default.createElement(
      "div",
      {
        className: `cd-message-block${amendEditing ? " cd-message-block--editing" : ""}${!amendEditing && isHeadCommit ? " cd-message-block--amendable" : ""}`,
        style: amendEditing ? void 0 : { height: msgHeight, minHeight: MIN_MSG_H, maxHeight: MAX_MSG_H },
        onClick: !amendEditing && isHeadCommit ? () => {
          const full = commit.message + (body ? "\n\n" + body : "");
          setAmendMsg(full);
          setAmendEditing(true);
        } : void 0,
        title: !amendEditing && isHeadCommit ? t("panel.clickToAmend") : void 0
      },
      amendEditing ? /* @__PURE__ */ import_react8.default.createElement(
        "textarea",
        {
          className: "cd-amend-textarea",
          value: amendMsg,
          onChange: (e) => setAmendMsg(e.target.value),
          autoFocus: true,
          onClick: (e) => e.stopPropagation()
        }
      ) : /* @__PURE__ */ import_react8.default.createElement(import_react8.default.Fragment, null, /* @__PURE__ */ import_react8.default.createElement("p", { className: "cd-title" }, linkifyIssues(commit.message, githubRepo)), cleanBody && /* @__PURE__ */ import_react8.default.createElement("pre", { className: "cd-body" }, linkifyIssues(cleanBody, githubRepo)))
    ), amendEditing && /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-amend-actions" }, /* @__PURE__ */ import_react8.default.createElement(
      "button",
      {
        className: "cd-amend-confirm",
        disabled: amendLoading || !amendMsg.trim(),
        onClick: async () => {
          setAmendLoading(true);
          try {
            await window.gitAPI.amendMessage(amendMsg.trim());
            setAmendEditing(false);
            onAmendSuccess?.();
          } catch (err) {
            console.error("amend failed", err);
          } finally {
            setAmendLoading(false);
          }
        }
      },
      amendLoading ? "\u2026" : t("panel.amendConfirm")
    ), /* @__PURE__ */ import_react8.default.createElement("button", { className: "cd-amend-cancel", onClick: () => setAmendEditing(false) }, t("panel.amendCancel"))), !amendEditing && /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-resize-handle", onMouseDown: onResizeMouseDown }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-resize-grip" })), /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-info-zone" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-author-block" }, /* @__PURE__ */ import_react8.default.createElement(GravatarAvatar, { email: commit.authorEmail, name: commit.author, sha: commit.hash, size: 36, radius: 6 }), /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-author-mid" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-author-name" }, commit.author), /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-author-meta" }, "authored ", fmtDate2(commit.date))), parentShort && /* @__PURE__ */ import_react8.default.createElement("button", { className: "cd-parent-btn", onClick: () => onSelectCommit(commit.parents[0]) }, "parent: ", /* @__PURE__ */ import_react8.default.createElement("code", null, parentShort))), coAuthors.length > 0 && /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-coauthors" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-label" }, "Co-authors:"), coAuthors.map((a, i) => /* @__PURE__ */ import_react8.default.createElement(GravatarAvatar, { key: i, email: a.email, name: a.name, size: 28, radius: 6 }))), commit.refs.length > 0 && /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-refs" }, commit.refs.filter((r) => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r)).map((r, i) => {
      const isHead = r.includes("HEAD"), isTag = r.startsWith("tag:");
      const isRemote = r.includes("origin/") || r.includes("remotes/");
      const text = r.replace("tag: ", "").replace("HEAD -> ", "\u2605 ");
      const cls = isHead ? "rp-ref-head" : isTag ? "rp-ref-tag" : isRemote ? "rp-ref-remote" : "rp-ref-local";
      return /* @__PURE__ */ import_react8.default.createElement("span", { key: i, className: `rp-ref ${cls}` }, text);
    })), files.length > 0 && (() => {
      const nMod = files.filter((f) => f.status !== "A" && f.status !== "D").length;
      const nAdd = files.filter((f) => f.status === "A").length;
      const nDel = files.filter((f) => f.status === "D").length;
      return /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-files-count-row" }, nMod > 0 && /* @__PURE__ */ import_react8.default.createElement(import_react8.default.Fragment, null, /* @__PURE__ */ import_react8.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "#e3b341", style: { flexShrink: 0 } }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" })), /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-count-mod" }, nMod, " modified")), nAdd > 0 && /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-count-add" }, "+ ", nAdd, " added"), nDel > 0 && /* @__PURE__ */ import_react8.default.createElement("span", { className: "cd-count-del" }, "\u2212 ", nDel, " deleted"));
    })(), /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-files-bar" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: "cd-sort-btn", title: "Trier" }, /* @__PURE__ */ import_react8.default.createElement("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M2 4.75a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z" }))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "cd-view-toggle" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: `cd-view-btn ${!cdTreeMode ? "active" : ""}`, onClick: () => {
      setView("files");
      setCdTreeMode(false);
      localStorage.setItem("cd-tree-mode", "false");
    } }, /* @__PURE__ */ import_react8.default.createElement("svg", { width: "11", height: "11", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 0 1H3v10h9.5a.5.5 0 0 1 0 1h-10A.5.5 0 0 1 2 13.5v-11Z" })), "Path"), /* @__PURE__ */ import_react8.default.createElement("button", { className: `cd-view-btn ${cdTreeMode ? "active" : ""}`, onClick: () => setCdTreeMode((v) => {
      localStorage.setItem("cd-tree-mode", String(!v));
      return !v;
    }) }, /* @__PURE__ */ import_react8.default.createElement("svg", { width: "11", height: "11", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M1.75 2.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5zm0 4a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5zm0 4a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5zm9.5-8a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3zm0 4a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3zm0 4a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3z" })), "Tree")), /* @__PURE__ */ import_react8.default.createElement("label", { className: "cd-viewall" }, /* @__PURE__ */ import_react8.default.createElement("input", { type: "checkbox", checked: viewAll, onChange: (e) => setViewAll(e.target.checked) }), /* @__PURE__ */ import_react8.default.createElement("span", null, "Tous les fichiers"))), view === "files" && /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-file-list" }, cdTreeMode ? buildTree(files.map((f) => ({ path: f.path, status: f.status ?? "M" }))).map((node) => /* @__PURE__ */ import_react8.default.createElement(
      TreeFileRow,
      {
        key: node.fullPath,
        node,
        depth: 0,
        onAction: () => {
        },
        actionIcon: "",
        actionTitle: "",
        onSelect: (p) => {
          setSelectedFile(p);
          onOpenFileDiff?.({ type: "commit", commitHash: commit.hash, filePath: p });
        },
        isSelected: selectedFile === node.fullPath
      }
    )) : files.map((f, i) => {
      const { dir, name } = formatPath(f.path);
      const s = f.status ?? "M";
      return /* @__PURE__ */ import_react8.default.createElement(
        "div",
        {
          key: i,
          className: `rp-file-row ${selectedFile === f.path ? "active" : ""}`,
          onClick: () => {
            setSelectedFile(f.path);
            onOpenFileDiff?.({ type: "commit", commitHash: commit.hash, filePath: f.path });
          }
        },
        s === "A" ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-fsi rp-fsi-add" }, "+") : s === "D" ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-fsi rp-fsi-del" }, "\u2212") : s === "R" ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-fsi rp-fsi-ren" }, "R") : /* @__PURE__ */ import_react8.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "#e3b341", className: "rp-file-pencil" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" })),
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-file-path" }, dir && /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-file-dir" }, dir), /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-file-name" }, name)),
        /* @__PURE__ */ import_react8.default.createElement(
          "button",
          {
            className: "rp-history-btn",
            title: t("panel.history"),
            onClick: (e) => {
              e.stopPropagation();
              setFileHistoryPath(f.path);
            }
          },
          /* @__PURE__ */ import_react8.default.createElement("svg", { width: "11", height: "11", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M1.643 3.143L.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684zM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4z" }))
        )
      );
    }), files.length === 0 && /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-empty" }, t("panel.loading"))), fileHistoryPath && /* @__PURE__ */ import_react8.default.createElement(
      FileHistoryModal,
      {
        filepath: fileHistoryPath,
        onClose: () => setFileHistoryPath(null),
        onSelectCommit
      }
    ), view === "blame" && selectedFile && /* @__PURE__ */ import_react8.default.createElement(BlameView, { commitHash: commit.hash, filepath: selectedFile, onSelectCommit }))));
  }
  var SUMMARY_LIMIT = 72;
  var IcoTrash = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15Z" }));
  var IcoSpark = ({ size = 14 }) => /* @__PURE__ */ import_react8.default.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-6.5 6.5a1.516 1.516 0 0 1-2.56-1.31L5.811 10.5H3.688c-1.57 0-2.347-1.909-1.22-3.004l6.5-6.5.536-.565z" }));
  var IcoSort = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M4.25 2a.75.75 0 0 1 .75.75v8.69l1.22-1.22a.75.75 0 1 1 1.06 1.06l-2.5 2.5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.22 1.22V2.75A.75.75 0 0 1 4.25 2Zm5 1h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5Zm0 3.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5Zm0 3.5h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5Z" }));
  var IcoPathView = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4A.75.75 0 0 1 2.75 7h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 7.75Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" }));
  var IcoTreeView = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M1.75 2.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Zm5 0a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5ZM6 7.75A.75.75 0 0 1 6.75 7h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 6 7.75Zm.75 3.75a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5ZM2.5 5.5a.75.75 0 0 0-1.5 0v6.75c0 .414.336.75.75.75H4.5a.75.75 0 0 0 0-1.5H2.5V5.5Z" }));
  var IcoCommit = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M10.95 7.25a3.001 3.001 0 0 0-5.9 0H1.75a.75.75 0 0 0 0 1.5h3.3a3.001 3.001 0 0 0 5.9 0h3.3a.75.75 0 0 0 0-1.5h-3.3ZM8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" }));
  var IcoStash = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M2.75 1A1.75 1.75 0 0 0 1 2.75v7.5C1 11.216 1.784 12 2.75 12h2.5a.75.75 0 0 0 0-1.5h-2.5a.25.25 0 0 1-.25-.25V6h11v.25a.75.75 0 0 0 1.5 0v-3.5A1.75 1.75 0 0 0 13.25 1H2.75Zm10.75 3.5h-11v-1.75a.25.25 0 0 1 .25-.25h10.5a.25.25 0 0 1 .25.25V4.5ZM10 11.25a.75.75 0 0 1 .75-.75h1.69l-.97-.97a.75.75 0 1 1 1.06-1.06l2.25 2.25a.75.75 0 0 1 0 1.06l-2.25 2.25a.75.75 0 1 1-1.06-1.06l.97-.97h-1.69a.75.75 0 0 1-.75-.75Z" }));
  var IcoCloud = () => /* @__PURE__ */ import_react8.default.createElement("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.878 1.464-2.383Zm4.843 5.804a.75.75 0 0 0 1.06-1.06L8.53 5.946a.75.75 0 0 0-1.06 0L5.69 8.086a.75.75 0 1 0 1.06 1.06l.75-.75v3.073a.75.75 0 0 0 1.5 0V8.396l.75.75Z" }));
  var IcoChevron = ({ open }) => /* @__PURE__ */ import_react8.default.createElement("svg", { className: `st2-chev ${open ? "open" : ""}`, width: "11", height: "11", viewBox: "0 0 16 16", fill: "currentColor" }, /* @__PURE__ */ import_react8.default.createElement("path", { d: "M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" }));
  var CC_TYPES = ["feat", "fix", "chore", "docs", "refactor", "perf", "test", "build", "ci"];
  var CC_PREFIX_RE = /^([a-z]+)(\([^)]*\))?!?:\s*/;
  function ccTypeOf(summary) {
    const m = CC_PREFIX_RE.exec(summary);
    return m && CC_TYPES.includes(m[1]) ? m[1] : "";
  }
  function StagingView({ onCommitSuccess, showToast, currentBranch, conflictMode, conflictFiles, onConflictFinish, onConflictAbort, onOpenFileDiff }) {
    const { t } = useLang();
    const isConflict = !!conflictMode;
    const [changes, setChanges] = (0, import_react8.useState)({ staged: [], unstaged: [], untracked: [] });
    const [summary, setSummary] = (0, import_react8.useState)("");
    const [description, setDescription] = (0, import_react8.useState)("");
    const [amend, setAmend] = (0, import_react8.useState)(false);
    const [amendFiles, setAmendFiles] = (0, import_react8.useState)([]);
    const [treeMode, setTreeMode] = (0, import_react8.useState)(() => localStorage.getItem("st-tree-mode") === "true");
    const [sortAsc, setSortAsc] = (0, import_react8.useState)(true);
    const [unstagedOpen, setUnstagedOpen] = (0, import_react8.useState)(true);
    const [stagedOpen, setStagedOpen] = (0, import_react8.useState)(true);
    const [optionsOpen, setOptionsOpen] = (0, import_react8.useState)(false);
    const [signoff, setSignoff] = (0, import_react8.useState)(false);
    const [committing, setCommitting] = (0, import_react8.useState)(false);
    const [generating, setGenerating] = (0, import_react8.useState)(false);
    const [selectedDiff, setSelectedDiff] = (0, import_react8.useState)(null);
    const [formHeight, setFormHeight] = (0, import_react8.useState)(() => parseInt(localStorage.getItem("st-form-h") || "300"));
    const dragRef = (0, import_react8.useRef)(null);
    const stRootRef = (0, import_react8.useRef)(null);
    const [panelH, setPanelH] = (0, import_react8.useState)(0);
    (0, import_react8.useEffect)(() => {
      const el = stRootRef.current;
      if (!el)
        return;
      const ro = new ResizeObserver((entries) => setPanelH(entries[0].contentRect.height));
      ro.observe(el);
      return () => ro.disconnect();
    }, []);
    const maxFormH = panelH > 0 ? Math.max(140, panelH - 220) : Infinity;
    const effFormHeight = Math.min(formHeight, maxFormH);
    const splitMessage = (full) => {
      const lines = full.split("\n");
      setSummary(lines[0] ?? "");
      setDescription(lines.slice(1).join("\n").replace(/^\n+/, ""));
    };
    const toggleAmend = (0, import_react8.useCallback)(async (checked) => {
      setAmend(checked);
      if (checked) {
        const [msgRes, filesRes] = await Promise.all([
          window.gitAPI.getLastCommitMessage(),
          window.gitAPI.getCommitFiles("HEAD")
        ]);
        const full = msgRes.message ?? "";
        const lines = full.split("\n");
        setSummary(lines[0] ?? "");
        setDescription(lines.slice(1).join("\n").replace(/^\n+/, ""));
        setAmendFiles(filesRes.files ?? []);
      } else {
        setSummary("");
        setDescription("");
        setAmendFiles([]);
      }
    }, []);
    const load = (0, import_react8.useCallback)(async () => {
      const r = await window.gitAPI.getWorkingChanges();
      setChanges(r);
    }, []);
    (0, import_react8.useEffect)(() => {
      load();
    }, [load]);
    (0, import_react8.useEffect)(() => {
      const handler = () => load();
      window.gitAPI.onRepoChanged(handler);
      window.gitAPI.onWorkingChanged(handler);
      return () => {
        window.gitAPI.offRepoChanged(handler);
        window.gitAPI.offWorkingChanged(handler);
      };
    }, [load]);
    (0, import_react8.useEffect)(() => {
      if (isConflict) {
        window.gitAPI.getMergeMessage().then((r) => {
          if (r.message)
            splitMessage(r.message);
        });
      }
    }, [isConflict]);
    const onResizeDown = (0, import_react8.useCallback)((e) => {
      e.preventDefault();
      dragRef.current = { y: e.clientY, h: formHeight };
      const onMove = (ev) => {
        if (!dragRef.current)
          return;
        const next = Math.min(560, maxFormH, Math.max(150, dragRef.current.h - (ev.clientY - dragRef.current.y)));
        setFormHeight(next);
      };
      const onUp = () => {
        if (dragRef.current)
          localStorage.setItem("st-form-h", String(formHeight));
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }, [formHeight, maxFormH]);
    const generateMessage = async () => {
      setGenerating(true);
      try {
        const r = await window.gitAPI.aiGenerateCommitMessage();
        if (!r)
          showToast(t("panel.gen.empty"), "err");
        else if (r.error === "NO_API_KEY")
          showToast(t("panel.gen.noKey"), "err");
        else if (r.error)
          showToast(t("panel.gen.failed", r.error ?? ""), "err");
        else if (r.message)
          splitMessage(r.message);
        else
          showToast(t("panel.gen.empty"), "err");
      } catch (e) {
        showToast(t("panel.gen.unexpected", e?.message ?? e), "err");
      } finally {
        setGenerating(false);
      }
    };
    const handle = async (fn, reload = true) => {
      await fn();
      if (reload)
        await load();
    };
    const selectFile = (file) => {
      setSelectedDiff(file);
      onOpenFileDiff?.({ type: "working", filePath: file.path, area: file.area });
    };
    const discardAll = async () => {
      const staged = changes.staged.map((f) => f.path);
      const unstaged = [...changes.unstaged.map((f) => f.path), ...changes.untracked.filter((f) => !f.endsWith("/"))];
      const all = [...staged, ...unstaged];
      if (!all.length)
        return;
      if (!window.confirm(t("panel.discardAll.confirm", String(all.length))))
        return;
      if (staged.length)
        await window.gitAPI.unstage(staged);
      for (const f of all)
        await window.gitAPI.discardFile(f);
      await load();
    };
    const sortFiles = (arr) => [...arr].sort((a, b) => sortAsc ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path));
    const totalUnstaged = changes.unstaged.length + changes.untracked.length;
    const stagedPaths = new Set(changes.staged.map((f) => f.path));
    const amendOnly = amendFiles.filter((f) => !stagedPaths.has(f.path));
    const stagedCount = changes.staged.length + amendOnly.length;
    const totalChanged = changes.staged.length + totalUnstaged;
    const canCommit = changes.staged.length > 0 || amend;
    const toggleTree = () => setTreeMode((v) => {
      localStorage.setItem("st-tree-mode", String(!v));
      return !v;
    });
    const sortedStaged = sortFiles(changes.staged);
    const sortedUnstaged = sortFiles(changes.unstaged);
    const sortedUntracked = sortFiles(changes.untracked.map((p) => ({ path: p }))).map((x) => x.path);
    const stagedTree = buildTree(sortedStaged.map((f) => ({ path: f.path, status: f.status })));
    const unstagedTree = buildTree([
      ...sortedUnstaged.map((f) => ({ path: f.path, status: f.status })),
      ...sortedUntracked.map((f) => ({ path: f, status: "?" }))
    ]);
    const remaining = SUMMARY_LIMIT - summary.length;
    const branchName = currentBranch || "HEAD";
    const commitLabel = (() => {
      if (committing)
        return t("panel.commit.inProgress");
      if (isConflict)
        return "Commit & Merge";
      if (!canCommit)
        return t("panel.commit.stageFirst");
      if (!summary.trim())
        return t("panel.commit.typeMessage");
      if (amend && changes.staged.length === 0)
        return t("panel.commit.amend");
      const n = changes.staged.length;
      return t("panel.commit.changes", String(n), n !== 1 ? "s" : "");
    })();
    const commitReady = isConflict ? !!summary.trim() && !conflictFiles?.length : canCommit && !!summary.trim();
    return /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-content rp-staging st2", ref: stRootRef }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-topbar" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-icon-btn st2-danger", title: t("panel.discardAll"), onClick: discardAll, disabled: totalChanged === 0 }, /* @__PURE__ */ import_react8.default.createElement(IcoTrash, null)), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-topbar-mid" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "st2-changecount" }, totalChanged, " ", totalChanged === 1 ? t("panel.fileChange") : t("panel.fileChanges")), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st2-on" }, t("panel.on")), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st2-branch-chip", title: branchName }, branchName)), /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-icon-btn st2-ai", title: t("panel.generate.tooltip"), onClick: generateMessage, disabled: generating }, /* @__PURE__ */ import_react8.default.createElement(IcoSpark, null))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-viewbar" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-icon-btn st2-sort", title: t("panel.sort"), onClick: () => setSortAsc((s) => !s) }, /* @__PURE__ */ import_react8.default.createElement(IcoSort, null)), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-seg" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: `st2-seg-btn ${!treeMode ? "active" : ""}`, onClick: () => treeMode && toggleTree() }, /* @__PURE__ */ import_react8.default.createElement(IcoPathView, null), " ", t("panel.view.path")), /* @__PURE__ */ import_react8.default.createElement("button", { className: `st2-seg-btn ${treeMode ? "active" : ""}`, onClick: () => !treeMode && toggleTree() }, /* @__PURE__ */ import_react8.default.createElement(IcoTreeView, null), " ", t("panel.view.tree")))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-lists" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: `st2-section ${unstagedOpen ? "open" : ""}` }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-section-head" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-section-toggle", onClick: () => setUnstagedOpen((o) => !o) }, /* @__PURE__ */ import_react8.default.createElement(IcoChevron, { open: unstagedOpen }), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st2-section-title" }, t("panel.unstaged"), " (", totalUnstaged, ")")), /* @__PURE__ */ import_react8.default.createElement("div", { style: { flex: 1 } }), totalUnstaged > 0 && /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-link st2-green", onClick: () => handle(() => window.gitAPI.stageAll()) }, t("panel.stageAll"))), unstagedOpen && /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-file-list" }, totalUnstaged === 0 ? /* @__PURE__ */ import_react8.default.createElement("div", { className: "st-empty" }, t("panel.noChanges")) : treeMode ? unstagedTree.map((node) => /* @__PURE__ */ import_react8.default.createElement(
      TreeFileRow,
      {
        key: node.fullPath,
        node,
        depth: 0,
        onAction: (paths) => handle(() => window.gitAPI.stage(paths)),
        actionIcon: "+",
        actionTitle: t("panel.stage.file", node.fullPath),
        onSelect: (p) => selectFile({ path: p, area: "unstaged" }),
        isSelected: selectedDiff?.area === "unstaged" && selectedDiff?.path === node.fullPath
      }
    )) : /* @__PURE__ */ import_react8.default.createElement(import_react8.default.Fragment, null, sortedUnstaged.map((f) => {
      const meta = STATUS_META[f.status] ?? STATUS_META["?"];
      const isSelected = selectedDiff?.path === f.path && selectedDiff.area === "unstaged";
      return /* @__PURE__ */ import_react8.default.createElement(
        "div",
        {
          key: f.path,
          className: `st-file-row st-clickable ${isSelected ? "st-selected" : ""}`,
          onClick: () => selectFile({ path: f.path, area: "unstaged" })
        },
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-badge", style: { color: meta.color } }, meta.label),
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-path", title: f.path }, f.path),
        /* @__PURE__ */ import_react8.default.createElement("button", { className: "st-action st-stage", title: t("panel.stage.file", f.path), onClick: (e) => {
          e.stopPropagation();
          handle(() => window.gitAPI.stage([f.path]));
        } }, "+"),
        /* @__PURE__ */ import_react8.default.createElement("button", { className: "st-action st-discard", title: t("panel.discard"), onClick: async (e) => {
          e.stopPropagation();
          if (!window.confirm(t("panel.discard.confirm", f.path)))
            return;
          handle(() => window.gitAPI.discardFile(f.path));
        } }, "\u21BA")
      );
    }), sortedUntracked.map((f) => {
      const isDir = f.endsWith("/");
      return /* @__PURE__ */ import_react8.default.createElement("div", { key: f, className: "st-file-row" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-badge", style: { color: "#3fb950" } }, isDir ? "\u{1F4C1}" : "?"), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-path", title: f }, f, isDir && /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-dir-hint" }, " ", t("panel.folder"))), /* @__PURE__ */ import_react8.default.createElement(
        "button",
        {
          className: "st-action st-stage",
          title: isDir ? t("panel.stage.folder", f) : t("panel.stage.file", f),
          onClick: () => handle(() => window.gitAPI.stage([f]))
        },
        "+"
      ), /* @__PURE__ */ import_react8.default.createElement("button", { className: "st-action st-discard", title: t("panel.deleteUntracked"), onClick: async (e) => {
        e.stopPropagation();
        if (!window.confirm(t("panel.deleteUntracked.confirm", f)))
          return;
        handle(() => window.gitAPI.discardFile(f));
      } }, "\u{1F5D1}"));
    })))), /* @__PURE__ */ import_react8.default.createElement("div", { className: `st2-section ${stagedOpen ? "open" : ""}` }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-section-head" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-section-toggle", onClick: () => setStagedOpen((o) => !o) }, /* @__PURE__ */ import_react8.default.createElement(IcoChevron, { open: stagedOpen }), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st2-section-title" }, t("panel.staged"), " (", stagedCount, ")")), /* @__PURE__ */ import_react8.default.createElement("div", { style: { flex: 1 } }), changes.staged.length > 0 && /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-link st2-danger-link", onClick: () => handle(() => window.gitAPI.unstage(changes.staged.map((f) => f.path))) }, t("panel.unstageAll"))), stagedOpen && /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-file-list" }, stagedCount === 0 ? /* @__PURE__ */ import_react8.default.createElement("div", { className: "st-empty" }, t("panel.noStaged")) : treeMode ? stagedTree.map((node) => /* @__PURE__ */ import_react8.default.createElement(
      TreeFileRow,
      {
        key: node.fullPath,
        node,
        depth: 0,
        onAction: (paths) => handle(() => window.gitAPI.unstage(paths)),
        actionIcon: "\u2212",
        actionTitle: t("panel.unstaged"),
        onSelect: (p) => selectFile({ path: p, area: "staged" }),
        isSelected: selectedDiff?.area === "staged" && selectedDiff?.path === node.fullPath
      }
    )) : /* @__PURE__ */ import_react8.default.createElement(import_react8.default.Fragment, null, sortedStaged.map((f) => {
      const meta = STATUS_META[f.status] ?? STATUS_META["?"];
      const isSelected = selectedDiff?.path === f.path && selectedDiff.area === "staged";
      return /* @__PURE__ */ import_react8.default.createElement(
        "div",
        {
          key: f.path,
          className: `st-file-row st-clickable ${isSelected ? "st-selected" : ""}`,
          onClick: () => selectFile({ path: f.path, area: "staged" })
        },
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-badge", style: { color: meta.color } }, meta.label),
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-path", title: f.path }, f.path),
        /* @__PURE__ */ import_react8.default.createElement("button", { className: "st-action st-unstage", title: t("panel.unstaged"), onClick: (e) => {
          e.stopPropagation();
          handle(() => window.gitAPI.unstage([f.path]));
        } }, "\u2212")
      );
    }), amendOnly.map((f) => {
      const meta = STATUS_META[f.status] ?? STATUS_META["?"];
      return /* @__PURE__ */ import_react8.default.createElement("div", { key: f.path, className: "st-file-row st-amend-file", title: t("panel.amendBadge.tooltip") }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-badge", style: { color: meta.color } }, meta.label), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-path" }, f.path), /* @__PURE__ */ import_react8.default.createElement("span", { className: "st-amend-tag" }, "amend"));
    }))))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-resize", onMouseDown: onResizeDown }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-resize-grip" })), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-commit", style: { height: effFormHeight } }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-commit-scroll" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-tabs" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-tab active" }, /* @__PURE__ */ import_react8.default.createElement(IcoCommit, null), " ", t("panel.tab.commit")), /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-tab-icon", title: t("panel.tab.stash"), onClick: async () => {
      const r = await window.gitAPI.createStash();
      if (r?.success === false)
        showToast(t("toast.stashErr", r.error ?? ""), "err");
      else {
        showToast(t("toast.stashCreated"));
        await load();
        onCommitSuccess();
      }
    } }, /* @__PURE__ */ import_react8.default.createElement(IcoStash, null)), /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-tab-icon", title: t("panel.tab.push"), onClick: async () => {
      const r = await window.gitAPI.push();
      if (r?.success === false)
        showToast(t("toast.pushErr", r.error ?? ""), "err");
      else
        showToast(t("toast.pushOk", branchName));
    } }, /* @__PURE__ */ import_react8.default.createElement(IcoCloud, null))), !isConflict && /* @__PURE__ */ import_react8.default.createElement("label", { className: "st2-amend" }, /* @__PURE__ */ import_react8.default.createElement("input", { type: "checkbox", checked: amend, onChange: (e) => toggleAmend(e.target.checked) }), /* @__PURE__ */ import_react8.default.createElement("span", null, t("panel.amendPrevious"))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-msgbox" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-summary-row" }, /* @__PURE__ */ import_react8.default.createElement(
      "select",
      {
        className: "st2-cc-type",
        title: t("panel.ccType.tooltip"),
        value: ccTypeOf(summary),
        onChange: (e) => {
          const type = e.target.value;
          const scope = CC_PREFIX_RE.exec(summary)?.[2] ?? "";
          const rest = summary.replace(CC_PREFIX_RE, "");
          setSummary(type ? `${type}${scope}: ${rest}` : rest);
        }
      },
      /* @__PURE__ */ import_react8.default.createElement("option", { value: "" }, "type"),
      CC_TYPES.map((c) => /* @__PURE__ */ import_react8.default.createElement("option", { key: c, value: c }, c))
    ), /* @__PURE__ */ import_react8.default.createElement(
      "input",
      {
        className: "st2-summary",
        placeholder: t("panel.commit.summary"),
        value: summary,
        onChange: (e) => setSummary(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
            doCommit();
        }
      }
    ), /* @__PURE__ */ import_react8.default.createElement("span", { className: `st2-counter ${remaining < 0 ? "over" : ""}` }, remaining), /* @__PURE__ */ import_react8.default.createElement(
      "button",
      {
        className: `st2-msg-ai ${generating ? "loading" : ""}`,
        title: t("panel.generate.tooltip"),
        onClick: generateMessage,
        disabled: generating
      },
      /* @__PURE__ */ import_react8.default.createElement(IcoSpark, { size: 13 })
    )), /* @__PURE__ */ import_react8.default.createElement(
      "textarea",
      {
        className: "st2-description",
        placeholder: t("panel.commit.description"),
        value: description,
        onChange: (e) => setDescription(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
            doCommit();
        }
      }
    )), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-options-row" }, /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-options-toggle", onClick: () => setOptionsOpen((o) => !o) }, /* @__PURE__ */ import_react8.default.createElement(IcoChevron, { open: optionsOpen }), " ", t("panel.commitOptions")), /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-compose", onClick: generateMessage, disabled: generating }, /* @__PURE__ */ import_react8.default.createElement(IcoSpark, { size: 13 }), " ", t("panel.composeAI"))), optionsOpen && /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-options" }, /* @__PURE__ */ import_react8.default.createElement("label", { className: "st2-amend" }, /* @__PURE__ */ import_react8.default.createElement("input", { type: "checkbox", checked: signoff, onChange: (e) => setSignoff(e.target.checked) }), /* @__PURE__ */ import_react8.default.createElement("span", null, t("panel.signoff"))))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "st2-commit-actions" }, isConflict && /* @__PURE__ */ import_react8.default.createElement("button", { className: "st2-commit-btn st2-abort", onClick: onConflictAbort }, t("panel.abort")), /* @__PURE__ */ import_react8.default.createElement(
      "button",
      {
        className: `st2-commit-btn ${commitReady ? "ready" : ""}`,
        disabled: !commitReady || committing,
        onClick: doCommit,
        title: "\u2318\u21B5"
      },
      /* @__PURE__ */ import_react8.default.createElement(IcoCommit, null),
      " ",
      commitLabel
    ))));
    async function doCommit() {
      if (!summary.trim())
        return;
      const full = summary.trim() + (description.trim() ? `

${description.trim()}` : "");
      setCommitting(true);
      if (isConflict && onConflictFinish) {
        const action = conflictMode === "rebase" || conflictMode === "cherry-pick" || conflictMode === "revert" ? "rebase" : "merge";
        onConflictFinish(action, full);
        setSummary("");
        setDescription("");
      } else {
        const message = signoff ? `${full}

Signed-off-by: ` : full;
        const r = await window.gitAPI.commit(message, amend);
        if (r.success) {
          showToast(t("toast.commitOk"));
          setSummary("");
          setDescription("");
          setAmend(false);
          setSelectedDiff(null);
          await load();
          onCommitSuccess();
        } else
          showToast(t("toast.commitErr", r.error ?? ""), "err");
      }
      setCommitting(false);
    }
  }
  function ConflictPanel({
    conflictFiles,
    conflictMode,
    onConflictFinish,
    onConflictAbort,
    onOpenResolver,
    showToast,
    onCommitSuccess
  }) {
    const { t } = useLang();
    const [commitMsg, setCommitMsg] = (0, import_react8.useState)("");
    const [committing, setCommitting] = (0, import_react8.useState)(false);
    const [resolvedFiles, setResolvedFiles] = (0, import_react8.useState)([]);
    (0, import_react8.useEffect)(() => {
      window.gitAPI.getMergeMessage().then((r) => {
        if (r.message)
          setCommitMsg(r.message);
      });
    }, []);
    (0, import_react8.useEffect)(() => {
      window.gitAPI.getWorkingChanges().then((r) => {
        if (r.staged) {
          const actuallyResolved = r.staged.filter((f) => !conflictFiles.includes(f.path));
          setResolvedFiles(actuallyResolved);
        }
      });
    }, [conflictFiles]);
    async function doCommit() {
      setCommitting(true);
      const action = conflictMode === "rebase" || conflictMode === "cherry-pick" || conflictMode === "revert" ? "rebase" : "merge";
      onConflictFinish(action, commitMsg);
      setCommitting(false);
    }
    const allResolved = conflictFiles.length === 0;
    return /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-content rp-conflict-mode" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-conflict-header" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "cr-warning" }, "\u26A0\uFE0F"), /* @__PURE__ */ import_react8.default.createElement("span", { className: "cr-title" }, "Conflits en cours : ", /* @__PURE__ */ import_react8.default.createElement("strong", null, conflictMode))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-section" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-section-header" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-section-title" }, "Fichiers en conflit (", conflictFiles.length, ")")), /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-file-list" }, conflictFiles.length === 0 && /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-empty" }, "Tous les conflits sont r\xE9solus"), conflictFiles.map((f) => /* @__PURE__ */ import_react8.default.createElement("div", { key: f, className: "rp-file-row rp-file-conflicted", onClick: () => onOpenResolver(f) }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-file-status", style: { color: "#ffa657" } }, "!"), /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-file-path" }, f))))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-section" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-section-header" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-section-title" }, "Fichiers r\xE9solus (", resolvedFiles.length, ")")), /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-file-list" }, resolvedFiles.length === 0 && /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-empty" }, "Aucun fichier r\xE9solu"), resolvedFiles.map((f) => /* @__PURE__ */ import_react8.default.createElement("div", { key: f.path, className: "rp-file-row rp-file-resolved" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-file-status", style: { color: "#3fb950" } }, "\u2713"), /* @__PURE__ */ import_react8.default.createElement("span", { className: "rp-file-path" }, f.path))))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-commit-area", style: { marginTop: "auto" } }, /* @__PURE__ */ import_react8.default.createElement(
      "textarea",
      {
        className: "rp-commit-input",
        placeholder: "Message de commit...",
        value: commitMsg,
        onChange: (e) => setCommitMsg(e.target.value)
      }
    ), /* @__PURE__ */ import_react8.default.createElement("div", { className: "rp-commit-actions", style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ import_react8.default.createElement(
      "button",
      {
        className: "rp-btn rp-btn-abort",
        style: { flex: 1, backgroundColor: "#21262d", color: "#f85149" },
        onClick: onConflictAbort
      },
      "Annuler le ",
      conflictMode
    ), /* @__PURE__ */ import_react8.default.createElement(
      "button",
      {
        className: "rp-btn rp-btn-commit",
        style: { flex: 1, backgroundColor: allResolved ? "#2ea043" : "#21262d", color: allResolved ? "#fff" : "#8b949e" },
        disabled: !allResolved || !commitMsg.trim() || committing,
        onClick: doCommit
      },
      committing ? "En cours\u2026" : "Commit & Merge"
    ))));
  }
  function RightPanel({
    selectedCommit,
    onCommitSuccess,
    showToast,
    onSelectCommit,
    currentBranch,
    wipCount,
    onViewWip,
    conflictFiles,
    conflictMode,
    onConflictFinish,
    onConflictAbort,
    onOpenResolver,
    onOpenFileDiff,
    githubRepo
  }) {
    const isWip = selectedCommit?.hash === "__WIP__";
    const hasCommit = !!selectedCommit && !isWip;
    const isConflict = conflictMode !== null && conflictMode !== void 0;
    const hasUnresolvedConflicts = isConflict && (conflictFiles?.length ?? 0) > 0;
    const allConflictsResolved = isConflict && (conflictFiles?.length ?? 0) === 0;
    return /* @__PURE__ */ import_react8.default.createElement("div", { className: "right-panel" }, hasUnresolvedConflicts ? /* @__PURE__ */ import_react8.default.createElement(
      ConflictPanel,
      {
        conflictFiles: conflictFiles ?? [],
        conflictMode,
        onConflictFinish,
        onConflictAbort,
        onOpenResolver,
        showToast,
        onCommitSuccess
      }
    ) : (isWip || allConflictsResolved) && !hasCommit ? /* @__PURE__ */ import_react8.default.createElement(
      StagingView,
      {
        onCommitSuccess,
        showToast,
        currentBranch,
        conflictMode: allConflictsResolved ? conflictMode : null,
        conflictFiles,
        onConflictFinish,
        onConflictAbort,
        onOpenFileDiff
      }
    ) : hasCommit ? /* @__PURE__ */ import_react8.default.createElement(
      CommitDetail,
      {
        commit: selectedCommit,
        onSelectCommit,
        wipCount,
        onViewWip,
        onOpenFileDiff,
        onAmendSuccess: onCommitSuccess,
        githubRepo
      }
    ) : null);
  }

  // ../src/renderer/src/components/InteractiveRebase/InteractiveRebase.tsx
  var import_react9 = __toESM(require_react());
  var ACTIONS = ["pick", "reword", "squash", "fixup", "drop"];
  var ACTION_COLORS = {
    pick: "#3fb950",
    reword: "#58a6ff",
    squash: "#d2a8ff",
    fixup: "#ffa657",
    drop: "#f85149"
  };
  function InteractiveRebase({ baseHash, onClose, onSuccess, showToast }) {
    const [entries, setEntries] = (0, import_react9.useState)([]);
    const [loading, setLoading] = (0, import_react9.useState)(true);
    const [running, setRunning] = (0, import_react9.useState)(false);
    const dragIndex = (0, import_react9.useRef)(null);
    const [dragOver, setDragOver] = (0, import_react9.useState)(null);
    (0, import_react9.useEffect)(() => {
      window.gitAPI.getRebaseSequence(baseHash).then((r) => {
        setEntries(r.commits.map((c) => ({ ...c, action: "pick" })));
        setLoading(false);
      });
    }, [baseHash]);
    const setAction = (i, action) => {
      setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, action } : e));
    };
    const handleDragStart = (i) => {
      dragIndex.current = i;
    };
    const handleDragOver = (e, i) => {
      e.preventDefault();
      setDragOver(i);
    };
    const handleDrop = (targetIndex) => {
      const from = dragIndex.current;
      if (from === null || from === targetIndex) {
        setDragOver(null);
        return;
      }
      setEntries((prev) => {
        const arr = [...prev];
        const [item] = arr.splice(from, 1);
        arr.splice(targetIndex, 0, item);
        return arr;
      });
      dragIndex.current = null;
      setDragOver(null);
    };
    const handleLaunch = async () => {
      setRunning(true);
      const sequence = entries.map((e) => ({ action: e.action, hash: e.hash }));
      const r = await window.gitAPI.interactiveRebase(sequence);
      setRunning(false);
      if (r.success) {
        showToast("\u2713 Rebase interactif r\xE9ussi");
        onSuccess();
        onClose();
      } else {
        showToast(`Rebase \xE9chou\xE9 : ${r.error}`, "err");
      }
    };
    return /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-overlay", onMouseDown: (e) => e.target === e.currentTarget && onClose() }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-panel" }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-header" }, /* @__PURE__ */ import_react9.default.createElement("span", { className: "ir-title" }, "\u26A1 Interactive Rebase"), /* @__PURE__ */ import_react9.default.createElement("span", { className: "ir-base" }, "depuis ", /* @__PURE__ */ import_react9.default.createElement("code", null, baseHash.slice(0, 7))), /* @__PURE__ */ import_react9.default.createElement("button", { className: "ir-close", onClick: onClose }, "\xD7")), /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-hint" }, "Glissez pour r\xE9ordonner \xB7 Changez l'action avec le menu d\xE9roulant"), /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-list" }, loading && /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-empty" }, "Chargement\u2026"), !loading && entries.length === 0 && /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-empty" }, "Aucun commit \xE0 rebaser"), entries.map((entry, i) => /* @__PURE__ */ import_react9.default.createElement(
      "div",
      {
        key: entry.hash,
        className: `ir-row ${dragOver === i ? "drag-over" : ""}`,
        draggable: true,
        onDragStart: () => handleDragStart(i),
        onDragOver: (e) => handleDragOver(e, i),
        onDrop: () => handleDrop(i),
        onDragEnd: () => setDragOver(null)
      },
      /* @__PURE__ */ import_react9.default.createElement("span", { className: "ir-drag-handle", title: "Glisser pour r\xE9ordonner" }, "\u283F"),
      /* @__PURE__ */ import_react9.default.createElement(
        "select",
        {
          className: "ir-action-select",
          value: entry.action,
          onChange: (e) => setAction(i, e.target.value),
          style: { color: ACTION_COLORS[entry.action] }
        },
        ACTIONS.map((a) => /* @__PURE__ */ import_react9.default.createElement("option", { key: a, value: a }, a))
      ),
      /* @__PURE__ */ import_react9.default.createElement("code", { className: "ir-hash" }, entry.shortHash),
      /* @__PURE__ */ import_react9.default.createElement("span", { className: "ir-msg" }, entry.message)
    ))), /* @__PURE__ */ import_react9.default.createElement("div", { className: "ir-footer" }, /* @__PURE__ */ import_react9.default.createElement("button", { className: "ir-cancel", onClick: onClose }, "Annuler"), /* @__PURE__ */ import_react9.default.createElement(
      "button",
      {
        className: "ir-launch",
        onClick: handleLaunch,
        disabled: running || entries.length === 0
      },
      running ? "Rebase en cours\u2026" : `\u26A1 Lancer le rebase (${entries.length} commits)`
    ))));
  }

  // src/webview/app.tsx
  function VertexApp() {
    const toast = useToast();
    const showToast = (0, import_react10.useCallback)((msg, type) => {
      if (type === "err")
        toast.error(msg);
      else
        toast.success(msg);
    }, [toast]);
    const [commits, setCommits] = (0, import_react10.useState)([]);
    const [branches, setBranches] = (0, import_react10.useState)([]);
    const [currentBranch, setCurrentBranch] = (0, import_react10.useState)("");
    const [repoName, setRepoName] = (0, import_react10.useState)("");
    const [selectedCommit, setSelectedCommit] = (0, import_react10.useState)(null);
    const [wipCount, setWipCount] = (0, import_react10.useState)(0);
    const [conflictFiles, setConflictFiles] = (0, import_react10.useState)([]);
    const [conflictMode, setConflictMode] = (0, import_react10.useState)(null);
    const [searchQuery, setSearchQuery] = (0, import_react10.useState)("");
    const [searchMatches, setSearchMatches] = (0, import_react10.useState)(-1);
    const [rightW, setRightW] = (0, import_react10.useState)(380);
    const [showAllBranches, setShowAllBranches] = (0, import_react10.useState)(true);
    const [stashCount, setStashCount] = (0, import_react10.useState)(0);
    const [loading, setLoading] = (0, import_react10.useState)(false);
    const [lastFetch, setLastFetch] = (0, import_react10.useState)(null);
    const [rebaseHash, setRebaseHash] = (0, import_react10.useState)(null);
    const isLoadingRef = (0, import_react10.useRef)(false);
    const showAllRef = (0, import_react10.useRef)(showAllBranches);
    showAllRef.current = showAllBranches;
    const loadRepoData = (0, import_react10.useCallback)(async (silent = false) => {
      if (isLoadingRef.current)
        return;
      isLoadingRef.current = true;
      if (!silent)
        setLoading(true);
      try {
        const branchRes = await window.gitAPI.getBranches();
        const logRes = await window.gitAPI.getLog({ maxCount: 500, all: showAllRef.current });
        if (logRes?.commits)
          setCommits(logRes.commits);
        if (branchRes?.branches) {
          setBranches(branchRes.branches);
          const cur = branchRes.branches.find((b) => b.current);
          if (cur)
            setCurrentBranch(cur.name);
        }
        const [conflictRes, modeRes] = await Promise.all([
          window.gitAPI.getConflictedFiles(),
          window.gitAPI.getConflictMode()
        ]);
        setConflictFiles(conflictRes?.files ?? []);
        setConflictMode(modeRes?.mode ?? null);
        const ch = await window.gitAPI.getWorkingChanges();
        setWipCount((ch?.staged?.length ?? 0) + (ch?.unstaged?.length ?? 0) + (ch?.untracked?.length ?? 0));
        try {
          const st = await window.gitAPI.getStashes();
          setStashCount(st?.stashes?.length ?? 0);
        } catch {
        }
        try {
          const info = await window.gitAPI.appGetInfo();
          if (info?.repoName)
            setRepoName(info.repoName);
        } catch {
        }
      } finally {
        isLoadingRef.current = false;
        if (!silent)
          setLoading(false);
      }
    }, []);
    (0, import_react10.useEffect)(() => {
      loadRepoData();
    }, [loadRepoData]);
    (0, import_react10.useEffect)(() => {
      const handler = () => loadRepoData(true);
      window.gitAPI.onRepoChanged(handler);
      window.gitAPI.onWorkingChanged(handler);
      return () => {
        window.gitAPI.offRepoChanged(handler);
        window.gitAPI.offWorkingChanged(handler);
      };
    }, [loadRepoData]);
    (0, import_react10.useEffect)(() => {
      if (!selectedCommit || selectedCommit.hash === "__WIP__")
        return;
      const still = commits.find((c) => c.hash === selectedCommit.hash);
      if (!still)
        setSelectedCommit(null);
    }, [commits]);
    const doUndo = (0, import_react10.useCallback)(async () => {
      const r = await window.gitAPI.undoLastAction();
      if (r && r.success === false)
        toast.error(r.error ?? "Impossible d'annuler");
      else
        toast.success("\u2713 Annul\xE9");
      await loadRepoData();
    }, [toast, loadRepoData]);
    const runOp = (0, import_react10.useCallback)(async (label, op, undoable = false) => {
      const r = await op();
      if (r && r.success === false)
        showToast(r.error ?? `${label} a \xE9chou\xE9`, "err");
      else if (undoable)
        toast.success(`\u2713 ${label}`, { label: "Annuler", onClick: () => {
          void doUndo();
        } });
      else
        showToast(`\u2713 ${label}`);
      await loadRepoData();
    }, [showToast, toast, doUndo, loadRepoData]);
    const handleCheckout = (0, import_react10.useCallback)((ref) => runOp("Checkout", () => window.gitAPI.checkout(ref)), [runOp]);
    const handleCherryPick = (0, import_react10.useCallback)((hash) => runOp("Cherry-pick", () => window.gitAPI.cherryPick(hash)), [runOp]);
    const handleRevert = (0, import_react10.useCallback)((hash) => runOp("Revert", () => window.gitAPI.revert(hash)), [runOp]);
    const handleReset = (0, import_react10.useCallback)((hash, mode) => runOp(`Reset --${mode}`, () => window.gitAPI.reset(hash, mode), true), [runOp]);
    const handleCreateTag = (0, import_react10.useCallback)(async (hash) => {
      const name = await window.gitAPI.uiPrompt("Nom du tag");
      if (name)
        runOp("Tag cr\xE9\xE9", () => window.gitAPI.createTag(name, hash));
    }, [runOp]);
    const handleCreateBranchAt = (0, import_react10.useCallback)(async (hash) => {
      const name = await window.gitAPI.uiPrompt("Nom de la nouvelle branche");
      if (name)
        runOp("Branche cr\xE9\xE9e", () => window.gitAPI.createBranchAt(name, hash, true));
    }, [runOp]);
    const handleDropCommit = (0, import_react10.useCallback)(async (hash) => {
      const ok = await window.gitAPI.uiConfirm(`Supprimer le commit ${hash.slice(0, 7)} ? Cette action r\xE9\xE9crit l'historique.`);
      if (!ok)
        return;
      setSelectedCommit(null);
      await runOp("Commit supprim\xE9", () => window.gitAPI.dropCommit(hash), true);
    }, [runOp]);
    const handleMoveCommit = (0, import_react10.useCallback)((hash, direction) => runOp("Commit d\xE9plac\xE9", () => window.gitAPI.moveCommit(hash, direction), true), [runOp]);
    const handleMergeBranch = (0, import_react10.useCallback)((name) => runOp(`Merge ${name}`, () => window.gitAPI.merge(name), true), [runOp]);
    const handleRebaseCurrentOnto = (0, import_react10.useCallback)((name) => runOp(`Rebase sur ${name}`, () => window.gitAPI.rebaseOnto(name), true), [runOp]);
    const handleRenameBranch = (0, import_react10.useCallback)(async (name) => {
      const newName = await window.gitAPI.uiPrompt("Nouveau nom de branche", name);
      if (newName && newName !== name)
        runOp("Branche renomm\xE9e", () => window.gitAPI.renameBranch(name, newName));
    }, [runOp]);
    const handleDeleteBranch = (0, import_react10.useCallback)(async (name) => {
      if (await window.gitAPI.uiConfirm(`Supprimer la branche "${name}" ?`)) {
        runOp("Branche supprim\xE9e", () => window.gitAPI.deleteBranch(name));
      }
    }, [runOp]);
    const handlePushBranch = (0, import_react10.useCallback)((name) => runOp(`Push ${name}`, () => window.gitAPI.pushBranch(name)), [runOp]);
    const handleSetUpstream = (0, import_react10.useCallback)((name) => runOp("Upstream d\xE9fini", () => window.gitAPI.setUpstream(name)), [runOp]);
    const handleDeleteRemoteBranch = (0, import_react10.useCallback)(async (ref) => {
      if (await window.gitAPI.uiConfirm(`Supprimer la branche distante "${ref}" ?`)) {
        runOp("Branche distante supprim\xE9e", () => window.gitAPI.deleteRemoteBranch(ref));
      }
    }, [runOp]);
    const handlePushTag = (0, import_react10.useCallback)((name) => runOp(`Tag ${name} pouss\xE9`, () => window.gitAPI.pushTag(name)), [runOp]);
    const handleDeleteTag = (0, import_react10.useCallback)(async (name) => {
      if (await window.gitAPI.uiConfirm(`Supprimer le tag "${name}" ?`)) {
        runOp("Tag supprim\xE9", () => window.gitAPI.deleteTag(name));
      }
    }, [runOp]);
    const handleDeleteRemoteTag = (0, import_react10.useCallback)(async (name) => {
      if (await window.gitAPI.uiConfirm(`Supprimer le tag distant "${name}" ?`)) {
        runOp("Tag distant supprim\xE9", () => window.gitAPI.deleteRemoteTag(name));
      }
    }, [runOp]);
    const handleBranchDrop = (0, import_react10.useCallback)(async (branch, hash, action) => {
      if (action === "reset") {
        const ok = await window.gitAPI.uiConfirm(`R\xE9initialiser ${branch} sur ${hash.slice(0, 7)} ?`);
        if (!ok)
          return;
      }
      const op = action === "reset" ? () => window.gitAPI.moveBranchTo(branch, hash) : action === "rebase" ? () => window.gitAPI.rebaseBranchOnto(branch, hash) : () => window.gitAPI.mergeCommitInto(branch, hash);
      await runOp(action === "reset" ? "Branche r\xE9initialis\xE9e" : action === "rebase" ? "Rebase effectu\xE9" : "Merge effectu\xE9", op, true);
    }, [runOp]);
    const handleConflictFinish = (0, import_react10.useCallback)(async (action, message) => {
      const mode = conflictMode ?? action;
      let r;
      if (mode === "rebase")
        r = await window.gitAPI.continueRebase();
      else if (mode === "cherry-pick")
        r = await window.gitAPI.continueCherryPick();
      else if (mode === "revert")
        r = await window.gitAPI.continueRevert();
      else
        r = await window.gitAPI.continueMerge(message);
      if (r && r.success === false)
        showToast(r.error ?? "\xC9chec", "err");
      else
        showToast(mode === "rebase" ? "\u2713 Rebase continu\xE9" : "\u2713 Conflits r\xE9solus");
      await loadRepoData();
    }, [conflictMode, showToast, loadRepoData]);
    const handleConflictAbort = (0, import_react10.useCallback)(async () => {
      if (conflictMode === "merge")
        await window.gitAPI.abortMerge();
      else if (conflictMode === "cherry-pick")
        await window.gitAPI.abortCherryPick();
      else if (conflictMode === "revert")
        await window.gitAPI.abortRevert();
      else
        await window.gitAPI.abortRebase();
      showToast("Op\xE9ration abandonn\xE9e");
      await loadRepoData();
    }, [conflictMode, showToast, loadRepoData]);
    const handleOpenResolver = (0, import_react10.useCallback)((file) => {
      window.gitAPI.openConflict(file);
    }, []);
    const handleOpenFileDiff = (0, import_react10.useCallback)((target) => {
      window.gitAPI.openDiff(target);
    }, []);
    const handleFetch = (0, import_react10.useCallback)(async () => {
      await runOp("Fetch", () => window.gitAPI.fetch());
      setLastFetch(/* @__PURE__ */ new Date());
    }, [runOp]);
    const handleOpenDesktop = (0, import_react10.useCallback)(() => window.gitAPI.openDesktop(), []);
    const handlePull = (0, import_react10.useCallback)(() => runOp("Pull", () => window.gitAPI.pull()), [runOp]);
    const handlePush = (0, import_react10.useCallback)(() => runOp("Push", () => window.gitAPI.push()), [runOp]);
    const handleUndo = (0, import_react10.useCallback)(() => runOp("Annul\xE9", () => window.gitAPI.undoLastAction()), [runOp]);
    const handleRedo = (0, import_react10.useCallback)(() => runOp("R\xE9tabli", () => window.gitAPI.redoLastAction()), [runOp]);
    const handleStash = (0, import_react10.useCallback)(() => runOp("Stash cr\xE9\xE9", () => window.gitAPI.createStash()), [runOp]);
    const handlePop = (0, import_react10.useCallback)(() => runOp("Stash appliqu\xE9", () => window.gitAPI.popStash(0)), [runOp]);
    const handleTerminal = (0, import_react10.useCallback)(() => window.gitAPI.openTerminal(), []);
    const handleNewBranch = (0, import_react10.useCallback)(async () => {
      const name = await window.gitAPI.uiPrompt("Nom de la nouvelle branche");
      if (name)
        runOp("Branche cr\xE9\xE9e", () => window.gitAPI.createBranch(name));
    }, [runOp]);
    const handleToggleAllBranches = (0, import_react10.useCallback)(() => {
      setShowAllBranches((v) => {
        showAllRef.current = !v;
        return !v;
      });
      setTimeout(() => loadRepoData(), 0);
    }, [loadRepoData]);
    const startResizeRight = (0, import_react10.useCallback)((e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightW;
      const onMove = (ev) => {
        const w = Math.max(320, Math.min(720, startW + (startX - ev.clientX)));
        setRightW(w);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }, [rightW]);
    const [viewportW, setViewportW] = (0, import_react10.useState)(window.innerWidth);
    (0, import_react10.useEffect)(() => {
      const onResize = () => setViewportW(window.innerWidth);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);
    const stacked = viewportW < 640;
    const showRight = !!selectedCommit || !!conflictMode;
    return /* @__PURE__ */ import_react10.default.createElement("div", { className: "app gv-app" }, /* @__PURE__ */ import_react10.default.createElement(
      CompactToolbar,
      {
        repoName,
        branch: currentBranch,
        branches,
        loading,
        stashCount,
        showAllBranches,
        searchQuery,
        searchMatches,
        lastFetch,
        onCheckout: handleCheckout,
        onSearch: setSearchQuery,
        onToggleAllBranches: handleToggleAllBranches,
        onFetch: handleFetch,
        onPull: handlePull,
        onPush: handlePush,
        onNewBranch: handleNewBranch,
        onStash: handleStash,
        onPop: handlePop,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onTerminal: handleTerminal,
        onOpenDesktop: handleOpenDesktop,
        onRefresh: loadRepoData
      }
    ), conflictMode && /* @__PURE__ */ import_react10.default.createElement("div", { className: "gv-conflict-banner" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "gv-cb-icon" }, "\u26A0\uFE0F"), /* @__PURE__ */ import_react10.default.createElement("span", { className: "gv-cb-text" }, /* @__PURE__ */ import_react10.default.createElement("strong", null, conflictMode), " en cours", conflictFiles.length > 0 ? ` \u2014 ${conflictFiles.length} fichier${conflictFiles.length > 1 ? "s" : ""} en conflit` : " \u2014 conflits r\xE9solus, pr\xEAt \xE0 continuer"), /* @__PURE__ */ import_react10.default.createElement("span", { className: "gv-cb-spring" }), /* @__PURE__ */ import_react10.default.createElement(
      "button",
      {
        className: "gv-cb-btn gv-cb-continue",
        disabled: conflictFiles.length > 0,
        title: conflictFiles.length > 0 ? "R\xE9solvez et indexez tous les fichiers d'abord" : "Continuer l'op\xE9ration",
        onClick: () => handleConflictFinish(conflictMode === "merge" ? "merge" : "rebase")
      },
      "Continuer"
    ), /* @__PURE__ */ import_react10.default.createElement("button", { className: "gv-cb-btn gv-cb-abort", onClick: handleConflictAbort }, "Abandonner")), /* @__PURE__ */ import_react10.default.createElement("div", { className: "app-body" }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "app-center", style: { flex: 1, display: stacked && showRight ? "none" : "flex", minWidth: 0, overflow: "hidden" } }, /* @__PURE__ */ import_react10.default.createElement(
      CommitGraph,
      {
        commits,
        selectedHash: selectedCommit?.hash ?? null,
        onSelectCommit: (c) => setSelectedCommit((prev) => prev?.hash === c.hash ? null : c),
        searchQuery,
        currentBranch,
        onCherryPick: handleCherryPick,
        onRevert: handleRevert,
        onReset: handleReset,
        onCreateTag: handleCreateTag,
        onCreateBranchAt: handleCreateBranchAt,
        onCheckoutBranch: handleCheckout,
        onCheckoutCommit: handleCheckout,
        onEditMessage: (hash) => {
          const found = commits.find((c) => c.hash === hash);
          if (found)
            setSelectedCommit(found);
        },
        onDropCommit: handleDropCommit,
        onMoveCommit: handleMoveCommit,
        onBranchDrop: handleBranchDrop,
        onMergeBranch: handleMergeBranch,
        onRebaseCurrentOnto: handleRebaseCurrentOnto,
        onRenameBranch: handleRenameBranch,
        onDeleteBranch: handleDeleteBranch,
        onPushBranch: handlePushBranch,
        onSetUpstream: handleSetUpstream,
        onDeleteRemoteBranch: handleDeleteRemoteBranch,
        onPushTag: handlePushTag,
        onDeleteTag: handleDeleteTag,
        onDeleteRemoteTag: handleDeleteRemoteTag,
        onInteractiveRebase: (hash) => setRebaseHash(hash),
        wipCount,
        conflictMode,
        loading,
        onSearchMatches: setSearchMatches
      }
    )), showRight && /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, !stacked && /* @__PURE__ */ import_react10.default.createElement("div", { className: "resize-handle", onMouseDown: startResizeRight }), /* @__PURE__ */ import_react10.default.createElement("div", { className: stacked ? "app-right gv-right-stacked" : "app-right", style: stacked ? void 0 : { width: rightW } }, stacked && !conflictMode && /* @__PURE__ */ import_react10.default.createElement("div", { className: "gv-stacked-bar" }, /* @__PURE__ */ import_react10.default.createElement("button", { className: "gv-stacked-back", onClick: () => setSelectedCommit(null) }, "\u2190 Graphe"), selectedCommit && selectedCommit.hash !== "__WIP__" && /* @__PURE__ */ import_react10.default.createElement("span", { className: "gv-stacked-title" }, selectedCommit.shortHash, " \u2014 ", selectedCommit.message)), /* @__PURE__ */ import_react10.default.createElement(
      RightPanel,
      {
        selectedCommit,
        onCommitSuccess: loadRepoData,
        showToast,
        currentBranch,
        wipCount,
        onViewWip: () => setSelectedCommit(
          (prev) => prev?.hash === "__WIP__" ? null : {
            hash: "__WIP__",
            shortHash: "WIP",
            message: "//WIP",
            author: "",
            authorEmail: "",
            date: "",
            parents: [],
            refs: []
          }
        ),
        onSelectCommit: (hash) => {
          const found = commits.find((c) => c.hash === hash || c.hash.startsWith(hash));
          if (found)
            setSelectedCommit(found);
        },
        conflictFiles,
        conflictMode,
        onConflictFinish: handleConflictFinish,
        onConflictAbort: handleConflictAbort,
        onOpenResolver: handleOpenResolver,
        onOpenFileDiff: handleOpenFileDiff
      }
    )))), rebaseHash && /* @__PURE__ */ import_react10.default.createElement(
      InteractiveRebase,
      {
        baseHash: rebaseHash,
        onClose: () => setRebaseHash(null),
        onSuccess: loadRepoData,
        showToast
      }
    ));
  }
  import_client.default.createRoot(document.getElementById("root")).render(
    /* @__PURE__ */ import_react10.default.createElement(SettingsProvider, null, /* @__PURE__ */ import_react10.default.createElement(LanguageProvider, null, /* @__PURE__ */ import_react10.default.createElement(ToastProvider, null, /* @__PURE__ */ import_react10.default.createElement(VertexApp, null))))
  );
})();
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.min.js:
  (**
   * @license React
   * scheduler.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.min.js:
  (**
   * @license React
   * react-dom.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
//# sourceMappingURL=main.js.map
