function isCompatible() {
    return !!('querySelector' in document && 'localStorage' in window && typeof Promise === 'function' && Promise.prototype['finally'] && /./g.flags === 'g' && (function() {
        try {
            new Function('async (a = 0,) => a');
            return true;
        } catch (e) {
            return false;
        }
    }()));
}
if (!isCompatible()) {
    document.documentElement.className = document.documentElement.className.replace(/(^|\s)client-js(\s|$)/, '$1client-nojs$2');
    while (window.NORLQ && NORLQ[0]) {
        NORLQ.shift()();
    }
    NORLQ = {
        push: function(fn) {
            fn();
        }
    };
    RLQ = {
        push: function() {}
    };
} else {
    if (window.performance && performance.mark) {
        performance.mark('mwStartup');
    }
    (function() {
        'use strict';
        var con = window.console;
        function Map() {
            this.values = Object.create(null);
        }
        Map.prototype = {
            constructor: Map,
            get: function(selection, fallback) {
                if (arguments.length < 2) {
                    fallback = null;
                }
                if (typeof selection === 'string') {
                    return selection in this.values ? this.values[selection] : fallback;
                }
                var results;
                if (Array.isArray(selection)) {
                    results = {};
                    for (var i = 0; i < selection.length; i++) {
                        if (typeof selection[i] === 'string') {
                            results[selection[i]] = selection[i] in this.values ? this.values[selection[i]] : fallback;
                        }
                    }
                    return results;
                }
                if (selection === undefined) {
                    results = {};
                    for (var key in this.values) {
                        results[key] = this.values[key];
                    }
                    return results;
                }
                return fallback;
            },
            set: function(selection, value) {
                if (arguments.length > 1) {
                    if (typeof selection === 'string') {
                        this.values[selection] = value;
                        return true;
                    }
                } else if (typeof selection === 'object') {
                    for (var key in selection) {
                        this.values[key] = selection[key];
                    }
                    return true;
                }
                return false;
            },
            exists: function(selection) {
                return typeof selection === 'string' && selection in this.values;
            }
        };
        var log = function() {};
        log.warn = Function.prototype.bind.call(con.warn, con);
        var mw = {
            now: function() {
                var perf = window.performance;
                var navStart = perf && perf.timing && perf.timing.navigationStart;
                mw.now = navStart && perf.now ? function() {
                    return navStart + perf.now();
                } : Date.now;
                return mw.now();
            },
            trackQueue: [],
            trackError: function(data) {
                if (mw.track) {
                    mw.track('resourceloader.exception', data);
                } else {
                    mw.trackQueue.push({
                        topic: 'resourceloader.exception',
                        args: [data]
                    });
                }
                var e = data.exception;
                var msg = (e ? 'Exception' : 'Error') + ' in ' + data.source + (data.module ? ' in module ' + data.module : '') + (e ? ':' : '.');
                con.log(msg);
                if (e) {
                    con.warn(e);
                }
            },
            Map: Map,
            config: new Map(),
            messages: new Map(),
            templates: new Map(),
            log: log
        };
        window.mw = window.mediaWiki = mw;
        window.QUnit = undefined;
    }());
    (function() {
        'use strict';
        var store,
            hasOwn = Object.hasOwnProperty;
        function fnv132(str) {
            var hash = 0x811C9DC5;
            for (var i = 0; i < str.length; i++) {
                hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
                hash ^= str.charCodeAt(i);
            }
            hash = (hash >>> 0).toString(36).slice(0, 5);
            while (hash.length < 5) {
                hash = '0' + hash;
            }
            return hash;
        }
        var registry = Object.create(null),
            sources = Object.create(null),
            handlingPendingRequests = false,
            pendingRequests = [],
            queue = [],
            jobs = [],
            willPropagate = false,
            errorModules = [],
            baseModules = ["jquery", "mediawiki.base"],
            marker = document.querySelector('meta[name="ResourceLoaderDynamicStyles"]'),
            lastCssBuffer;
        function addToHead(el, nextNode) {
            if (nextNode && nextNode.parentNode) {
                nextNode.parentNode.insertBefore(el, nextNode);
            } else {
                document.head.appendChild(el);
            }
        }
        function newStyleTag(text, nextNode) {
            var el = document.createElement('style');
            el.appendChild(document.createTextNode(text));
            addToHead(el, nextNode);
            return el;
        }
        function flushCssBuffer(cssBuffer) {
            if (cssBuffer === lastCssBuffer) {
                lastCssBuffer = null;
            }
            newStyleTag(cssBuffer.cssText, marker);
            for (var i = 0; i < cssBuffer.callbacks.length; i++) {
                cssBuffer.callbacks[i]();
            }
        }
        function addEmbeddedCSS(cssText, callback) {
            if (!lastCssBuffer || cssText.startsWith('@import')) {
                lastCssBuffer = {
                    cssText: '',
                    callbacks: []
                };
                requestAnimationFrame(flushCssBuffer.bind(null, lastCssBuffer));
            }
            lastCssBuffer.cssText += '\n' + cssText;
            lastCssBuffer.callbacks.push(callback);
        }
        function getCombinedVersion(modules) {
            var hashes = modules.reduce(function(result, module) {
                return result + registry[module].version;
            }, '');
            return fnv132(hashes);
        }
        function allReady(modules) {
            for (var i = 0; i < modules.length; i++) {
                if (mw.loader.getState(modules[i]) !== 'ready') {
                    return false;
                }
            }
            return true;
        }
        function allWithImplicitReady(module) {
            return allReady(registry[module].dependencies) &&
                (baseModules.includes(module) || allReady(baseModules));
        }
        function anyFailed(modules) {
            for (var i = 0; i < modules.length; i++) {
                var state = mw.loader.getState(modules[i]);
                if (state === 'error' || state === 'missing') {
                    return modules[i];
                }
            }
            return false;
        }
        function doPropagation() {
            var didPropagate = true;
            var module;
            while (didPropagate) {
                didPropagate = false;
                while (errorModules.length) {
                    var errorModule = errorModules.shift(),
                        baseModuleError = baseModules.includes(errorModule);
                    for (module in registry) {
                        if (registry[module].state !== 'error' && registry[module].state !== 'missing') {
                            if (baseModuleError && !baseModules.includes(module)) {
                                registry[module].state = 'error';
                                didPropagate = true;
                            } else if (registry[module].dependencies.includes(errorModule)) {
                                registry[module].state = 'error';
                                errorModules.push(module);
                                didPropagate = true;
                            }
                        }
                    }
                }
                for (module in registry) {
                    if (registry[module].state === 'loaded' && allWithImplicitReady(module)) {
                        execute(module);
                        didPropagate = true;
                    }
                }
                for (var i = 0; i < jobs.length; i++) {
                    var job = jobs[i];
                    var failed = anyFailed(job.dependencies);
                    if (failed !== false || allReady(job.dependencies)) {
                        jobs.splice(i, 1);
                        i -= 1;
                        try {
                            if (failed !== false && job.error) {
                                job.error(new Error('Failed dependency: ' + failed), job.dependencies);
                            } else if (failed === false && job.ready) {
                                job.ready();
                            }
                        } catch (e) {
                            mw.trackError({
                                exception: e,
                                source: 'load-callback'
                            });
                        }
                        didPropagate = true;
                    }
                }
            }
            willPropagate = false;
        }
        function setAndPropagate(module, state) {
            registry[module].state = state;
            if (state === 'ready') {
                store.add(module);
            } else if (state === 'error' || state === 'missing') {
                errorModules.push(module);
            } else if (state !== 'loaded') {
                return;
            }
            if (willPropagate) {
                return;
            }
            willPropagate = true;
            mw.requestIdleCallback(doPropagation, {
                timeout: 1
            });
        }
        function sortDependencies(module, resolved, unresolved) {
            if (!(module in registry)) {
                throw new Error('Unknown module: ' + module);
            }
            if (typeof registry[module].skip === 'string') {
                var skip = (new Function(registry[module].skip)());
                registry[module].skip = !!skip;
                if (skip) {
                    registry[module].dependencies = [];
                    setAndPropagate(module, 'ready');
                    return;
                }
            }
            if (!unresolved) {
                unresolved = new Set();
            }
            var deps = registry[module].dependencies;
            unresolved.add(module);
            for (var i = 0; i < deps.length; i++) {
                if (!resolved.includes(deps[i])) {
                    if (unresolved.has(deps[i])) {
                        throw new Error('Circular reference detected: ' + module + ' -> ' + deps[i]);
                    }
                    sortDependencies(deps[i], resolved, unresolved);
                }
            }
            resolved.push(module);
        }
        function resolve(modules) {
            var resolved = baseModules.slice();
            for (var i = 0; i < modules.length; i++) {
                sortDependencies(modules[i], resolved);
            }
            return resolved;
        }
        function resolveStubbornly(modules) {
            var resolved = baseModules.slice();
            for (var i = 0; i < modules.length; i++) {
                var saved = resolved.slice();
                try {
                    sortDependencies(modules[i], resolved);
                } catch (err) {
                    resolved = saved;
                    mw.log.warn('Skipped unavailable module ' + modules[i]);
                    if (modules[i] in registry) {
                        mw.trackError({
                            exception: err,
                            source: 'resolve'
                        });
                    }
                }
            }
            return resolved;
        }
        function resolveRelativePath(relativePath, basePath) {
            var relParts = relativePath.match(/^((?:\.\.?\/)+)(.*)$/);
            if (!relParts) {
                return null;
            }
            var baseDirParts = basePath.split('/');
            baseDirParts.pop();
            var prefixes = relParts[1].split('/');
            prefixes.pop();
            var prefix;
            var reachedRoot = false;
            while ((prefix = prefixes.pop()) !== undefined) {
                if (prefix === '..') {
                    reachedRoot = !baseDirParts.length || reachedRoot;
                    if (!reachedRoot) {
                        baseDirParts.pop();
                    } else {
                        baseDirParts.push(prefix);
                    }
                }
            }
            return (baseDirParts.length ? baseDirParts.join('/') + '/' : '') + relParts[2];
        }
        function makeRequireFunction(moduleObj, basePath) {
            return function require(moduleName) {
                var fileName = resolveRelativePath(moduleName, basePath);
                if (fileName === null) {
                    return mw.loader.require(moduleName);
                }
                if (hasOwn.call(moduleObj.packageExports, fileName)) {
                    return moduleObj.packageExports[fileName];
                }
                var scriptFiles = moduleObj.script.files;
                if (!hasOwn.call(scriptFiles, fileName)) {
                    throw new Error('Cannot require undefined file ' + fileName);
                }
                var result,
                    fileContent = scriptFiles[fileName];
                if (typeof fileContent === 'function') {
                    var moduleParam = {
                        exports: {}
                    };
                    fileContent(makeRequireFunction(moduleObj, fileName), moduleParam, moduleParam.exports);
                    result = moduleParam.exports;
                } else {
                    result = fileContent;
                }
                moduleObj.packageExports[fileName] = result;
                return result;
            };
        }
        function addScript(src, callback, modules) {
            var script = document.createElement('script');
            script.src = src;
            function onComplete() {
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                if (callback) {
                    callback();
                    callback = null;
                }
            }
            script.onload = onComplete;
            script.onerror = function() {
                onComplete();
                if (modules) {
                    for (var i = 0; i < modules.length; i++) {
                        setAndPropagate(modules[i], 'error');
                    }
                }
            };
            document.head.appendChild(script);
            return script;
        }
        function queueModuleScript(src, moduleName, callback) {
            pendingRequests.push(function() {
                if (moduleName !== 'jquery') {
                    window.require = mw.loader.require;
                    window.module = registry[moduleName].module;
                }
                addScript(src, function() {
                    delete window.module;
                    callback();
                    if (pendingRequests[0]) {
                        pendingRequests.shift()();
                    } else {
                        handlingPendingRequests = false;
                    }
                });
            });
            if (!handlingPendingRequests && pendingRequests[0]) {
                handlingPendingRequests = true;
                pendingRequests.shift()();
            }
        }
        function addLink(url, media, nextNode) {
            var el = document.createElement('link');
            el.rel = 'stylesheet';
            if (media) {
                el.media = media;
            }
            el.href = url;
            addToHead(el, nextNode);
            return el;
        }
        function globalEval(code) {
            var script = document.createElement('script');
            script.text = code;
            document.head.appendChild(script);
            script.parentNode.removeChild(script);
        }
        function indirectEval(code) {
            (1, eval)(code);
        }
        function enqueue(dependencies, ready, error) {
            if (allReady(dependencies)) {
                if (ready) {
                    ready();
                }
                return;
            }
            var failed = anyFailed(dependencies);
            if (failed !== false) {
                if (error) {
                    error(new Error('Dependency ' + failed + ' failed to load'), dependencies);
                }
                return;
            }
            if (ready || error) {
                jobs.push({
                    dependencies: dependencies.filter(function(module) {
                        var state = registry[module].state;
                        return state === 'registered' || state === 'loaded' || state === 'loading' || state === 'executing';
                    }),
                    ready: ready,
                    error: error
                });
            }
            dependencies.forEach(function(module) {
                if (registry[module].state === 'registered' && !queue.includes(module)) {
                    queue.push(module);
                }
            });
            mw.loader.work();
        }
        function execute(module) {
            if (registry[module].state !== 'loaded') {
                throw new Error('Module in state "' + registry[module].state + '" may not execute: ' + module);
            }
            registry[module].state = 'executing';
            var runScript = function() {
                var script = registry[module].script;
                var markModuleReady = function() {
                    setAndPropagate(module, 'ready');
                };
                var nestedAddScript = function(arr, offset) {
                    if (offset >= arr.length) {
                        markModuleReady();
                        return;
                    }
                    queueModuleScript(arr[offset], module, function() {
                        nestedAddScript(arr, offset + 1);
                    });
                };
                try {
                    if (Array.isArray(script)) {
                        nestedAddScript(script, 0);
                    } else if (typeof script === 'function') {
                        if (module === 'jquery') {
                            script();
                        } else {
                            script(window.$, window.$, mw.loader.require, registry[module].module);
                        }
                        markModuleReady();
                    } else if (typeof script === 'object' && script !== null) {
                        var mainScript = script.files[script.main];
                        if (typeof mainScript !== 'function') {
                            throw new Error('Main file in module ' + module + ' must be a function');
                        }
                        mainScript(makeRequireFunction(registry[module], script.main), registry[module].module, registry[module].module.exports);
                        markModuleReady();
                    } else if (typeof script === 'string') {
                        globalEval(script);
                        markModuleReady();
                    } else {
                        markModuleReady();
                    }
                } catch (e) {
                    setAndPropagate(module, 'error');
                    mw.trackError({
                        exception: e,
                        module: module,
                        source: 'module-execute'
                    });
                }
            };
            if (registry[module].deprecationWarning) {
                mw.log.warn(registry[module].deprecationWarning);
            }
            if (registry[module].messages) {
                mw.messages.set(registry[module].messages);
            }
            if (registry[module].templates) {
                mw.templates.set(module, registry[module].templates);
            }
            var cssPending = 0;
            var cssHandle = function() {
                cssPending++;
                return function() {
                    cssPending--;
                    if (cssPending === 0) {
                        var runScriptCopy = runScript;
                        runScript = undefined;
                        runScriptCopy();
                    }
                };
            };
            var style = registry[module].style;
            if (style) {
                if ('css' in style) {
                    for (var i = 0; i < style.css.length; i++) {
                        addEmbeddedCSS(style.css[i], cssHandle());
                    }
                }
                if ('url' in style) {
                    for (var media in style.url) {
                        var urls = style.url[media];
                        for (var j = 0; j < urls.length; j++) {
                            addLink(urls[j], media, marker);
                        }
                    }
                }
            }
            if (module === 'user') {
                var siteDeps;
                var siteDepErr;
                try {
                    siteDeps = resolve(['site']);
                } catch (e) {
                    siteDepErr = e;
                    runScript();
                }
                if (!siteDepErr) {
                    enqueue(siteDeps, runScript, runScript);
                }
            } else if (cssPending === 0) {
                runScript();
            }
        }
        function sortQuery(o) {
            var sorted = {};
            var list = [];
            for (var key in o) {
                list.push(key);
            }
            list.sort();
            for (var i = 0; i < list.length; i++) {
                sorted[list[i]] = o[list[i]];
            }
            return sorted;
        }
        function buildModulesString(moduleMap) {
            var str = [];
            var list = [];
            var p;
            function restore(suffix) {
                return p + suffix;
            }
            for (var prefix in moduleMap) {
                p = prefix === '' ? '' : prefix + '.';
                str.push(p + moduleMap[prefix].join(','));
                list.push.apply(list, moduleMap[prefix].map(restore));
            }
            return {
                str: str.join('|'),
                list: list
            };
        }
        function makeQueryString(params) {
            var str = '';
            for (var key in params) {
                str += (str ? '&' : '') + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
            }
            return str;
        }
        function batchRequest(batch) {
            if (!batch.length) {
                return;
            }
            var sourceLoadScript,
                currReqBase,
                moduleMap;
            function doRequest() {
                var query = Object.create(currReqBase),
                    packed = buildModulesString(moduleMap);
                query.modules = packed.str;
                query.version = getCombinedVersion(packed.list);
                query = sortQuery(query);
                addScript(sourceLoadScript + '?' + makeQueryString(query), null, packed.list);
            }
            batch.sort();
            var reqBase = {
                "lang": "ja",
                "skin": "vector-2022"
            };
            var splits = Object.create(null);
            for (var b = 0; b < batch.length; b++) {
                var bSource = registry[batch[b]].source;
                var bGroup = registry[batch[b]].group;
                if (!splits[bSource]) {
                    splits[bSource] = Object.create(null);
                }
                if (!splits[bSource][bGroup]) {
                    splits[bSource][bGroup] = [];
                }
                splits[bSource][bGroup].push(batch[b]);
            }
            for (var source in splits) {
                sourceLoadScript = sources[source];
                for (var group in splits[source]) {
                    var modules = splits[source][group];
                    currReqBase = Object.create(reqBase);
                    if (group === 0 && mw.config.get('wgUserName') !== null) {
                        currReqBase.user = mw.config.get('wgUserName');
                    }
                    var currReqBaseLength = makeQueryString(currReqBase).length + 23;
                    var length = 0;
                    moduleMap = Object.create(null);
                    for (var i = 0; i < modules.length; i++) {
                        var lastDotIndex = modules[i].lastIndexOf('.'),
                            prefix = modules[i].slice(0, Math.max(0, lastDotIndex)),
                            suffix = modules[i].slice(lastDotIndex + 1),
                            bytesAdded = moduleMap[prefix] ? suffix.length + 3 : modules[i].length + 3;
                        if (length && length + currReqBaseLength + bytesAdded > mw.loader.maxQueryLength) {
                            doRequest();
                            length = 0;
                            moduleMap = Object.create(null);
                        }
                        if (!moduleMap[prefix]) {
                            moduleMap[prefix] = [];
                        }
                        length += bytesAdded;
                        moduleMap[prefix].push(suffix);
                    }
                    doRequest();
                }
            }
        }
        function asyncEval(implementations, cb, offset) {
            if (!implementations.length) {
                return;
            }
            offset = offset || 0;
            mw.requestIdleCallback(function(deadline) {
                asyncEvalTask(deadline, implementations, cb, offset);
            });
        }
        function asyncEvalTask(deadline, implementations, cb, offset) {
            for (var i = offset; i < implementations.length; i++) {
                if (deadline.timeRemaining() <= 0) {
                    asyncEval(implementations, cb, i);
                    return;
                }
                try {
                    indirectEval(implementations[i]);
                } catch (err) {
                    cb(err);
                }
            }
        }
        function getModuleKey(module) {
            return module in registry ? (module + '@' + registry[module].version) : null;
        }
        function splitModuleKey(key) {
            var index = key.lastIndexOf('@');
            if (index === -1 || index === 0) {
                return {
                    name: key,
                    version: ''
                };
            }
            return {
                name: key.slice(0, index),
                version: key.slice(index + 1)
            };
        }
        function registerOne(module, version, dependencies, group, source, skip) {
            if (module in registry) {
                throw new Error('module already registered: ' + module);
            }
            registry[module] = {
                module: {
                    exports: {}
                },
                packageExports: {},
                version: version || '',
                dependencies: dependencies || [],
                group: typeof group === 'undefined' ? null : group,
                source: typeof source === 'string' ? source : 'local',
                state: 'registered',
                skip: typeof skip === 'string' ? skip : null
            };
        }
        mw.loader = {
            moduleRegistry: registry,
            maxQueryLength: 5000,
            addStyleTag: newStyleTag,
            addScriptTag: addScript,
            addLinkTag: addLink,
            enqueue: enqueue,
            resolve: resolve,
            work: function() {
                store.init();
                var q = queue.length,
                    storedImplementations = [],
                    storedNames = [],
                    requestNames = [],
                    batch = new Set();
                while (q--) {
                    var module = queue[q];
                    if (mw.loader.getState(module) === 'registered' && !batch.has(module)) {
                        registry[module].state = 'loading';
                        batch.add(module);
                        var implementation = store.get(module);
                        if (implementation) {
                            storedImplementations.push(implementation);
                            storedNames.push(module);
                        } else {
                            requestNames.push(module);
                        }
                    }
                }
                queue = [];
                asyncEval(storedImplementations, function(err) {
                    store.stats.failed++;
                    store.clear();
                    mw.trackError({
                        exception: err,
                        source: 'store-eval'
                    });
                    var failed = storedNames.filter(function(name) {
                        return registry[name].state === 'loading';
                    });
                    batchRequest(failed);
                });
                batchRequest(requestNames);
            },
            addSource: function(ids) {
                for (var id in ids) {
                    if (id in sources) {
                        throw new Error('source already registered: ' + id);
                    }
                    sources[id] = ids[id];
                }
            },
            register: function(modules) {
                if (typeof modules !== 'object') {
                    registerOne.apply(null, arguments);
                    return;
                }
                function resolveIndex(dep) {
                    return typeof dep === 'number' ? modules[dep][0] : dep;
                }
                for (var i = 0; i < modules.length; i++) {
                    var deps = modules[i][2];
                    if (deps) {
                        for (var j = 0; j < deps.length; j++) {
                            deps[j] = resolveIndex(deps[j]);
                        }
                    }
                    registerOne.apply(null, modules[i]);
                }
            },
            implement: function(module, script, style, messages, templates, deprecationWarning) {
                var split = splitModuleKey(module),
                    name = split.name,
                    version = split.version;
                if (!(name in registry)) {
                    mw.loader.register(name);
                }
                if (registry[name].script !== undefined) {
                    throw new Error('module already implemented: ' + name);
                }
                registry[name].version = version;
                registry[name].declarator = null;
                registry[name].script = script;
                registry[name].style = style;
                registry[name].messages = messages;
                registry[name].templates = templates;
                registry[name].deprecationWarning = deprecationWarning;
                if (registry[name].state !== 'error' && registry[name].state !== 'missing') {
                    setAndPropagate(name, 'loaded');
                }
            },
            impl: function(declarator) {
                var data = declarator(),
                    module = data[0],
                    script = data[1] || null,
                    style = data[2] || null,
                    messages = data[3] || null,
                    templates = data[4] || null,
                    deprecationWarning = data[5] || null,
                    split = splitModuleKey(module),
                    name = split.name,
                    version = split.version;
                if (!(name in registry)) {
                    mw.loader.register(name);
                }
                if (registry[name].script !== undefined) {
                    throw new Error('module already implemented: ' + name);
                }
                registry[name].version = version;
                registry[name].declarator = declarator;
                registry[name].script = script;
                registry[name].style = style;
                registry[name].messages = messages;
                registry[name].templates = templates;
                registry[name].deprecationWarning = deprecationWarning;
                if (registry[name].state !== 'error' && registry[name].state !== 'missing') {
                    setAndPropagate(name, 'loaded');
                }
            },
            load: function(modules, type) {
                if (typeof modules === 'string' && /^(https?:)?\/?\//.test(modules)) {
                    if (type === 'text/css') {
                        addLink(modules);
                    } else if (type === 'text/javascript' || type === undefined) {
                        addScript(modules);
                    } else {
                        throw new Error('Invalid type ' + type);
                    }
                } else {
                    modules = typeof modules === 'string' ? [modules] : modules;
                    enqueue(resolveStubbornly(modules));
                }
            },
            state: function(states) {
                for (var module in states) {
                    if (!(module in registry)) {
                        mw.loader.register(module);
                    }
                    setAndPropagate(module, states[module]);
                }
            },
            getState: function(module) {
                return module in registry ? registry[module].state : null;
            },
            require: function(moduleName) {
                if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
                    throw new Error('Module names cannot start with "./" or "../". Did you mean to use Package files?');
                }
                var path;
                if (window.QUnit) {
                    var paths = moduleName.startsWith('@') ? /^(@[^/]+\/[^/]+)\/(.*)$/.exec(moduleName) : /^([^/]+)\/(.*)$/.exec(moduleName);
                    if (paths) {
                        moduleName = paths[1];
                        path = paths[2];
                    }
                }
                if (mw.loader.getState(moduleName) !== 'ready') {
                    throw new Error('Module "' + moduleName + '" is not loaded');
                }
                return path ? makeRequireFunction(registry[moduleName], '')('./' + path) :
                registry[moduleName].module.exports;
            }
        };
        var hasPendingFlush = false,
            hasPendingWrites = false;
        function flushWrites() {
            while (store.queue.length) {
                store.set(store.queue.shift());
            }
            if (hasPendingWrites) {
                store.prune();
                try {
                    localStorage.removeItem(store.key);
                    localStorage.setItem(store.key, JSON.stringify({
                        items: store.items,
                        vary: store.vary,
                        asOf: Math.ceil(Date.now() / 1e7)
                    }));
                } catch (e) {
                    mw.trackError({
                        exception: e,
                        source: 'store-localstorage-update'
                    });
                }
            }
            hasPendingFlush = hasPendingWrites = false;
        }
        mw.loader.store = store = {
            enabled: null,
            items: {},
            queue: [],
            stats: {
                hits: 0,
                misses: 0,
                expired: 0,
                failed: 0
            },
            key: "MediaWikiModuleStore:jawiki",
            vary: "vector-2022:3:1:ja",
            init: function() {
                if (this.enabled === null) {
                    this.enabled = false;
                    if (true) {
                        this.load();
                    } else {
                        this.clear();
                    }
                }
            },
            load: function() {
                try {
                    var raw = localStorage.getItem(this.key);
                    this.enabled = true;
                    var data = JSON.parse(raw);
                    if (data && data.vary === this.vary && data.items && Date.now() < (data.asOf * 1e7) + 259e7) {
                        this.items = data.items;
                    }
                } catch (e) {}
            },
            get: function(module) {
                if (this.enabled) {
                    var key = getModuleKey(module);
                    if (key in this.items) {
                        this.stats.hits++;
                        return this.items[key];
                    }
                    this.stats.misses++;
                }
                return false;
            },
            add: function(module) {
                if (this.enabled) {
                    this.queue.push(module);
                    this.requestUpdate();
                }
            },
            set: function(module) {
                var descriptor = registry[module],
                    key = getModuleKey(module);
                if (key in this.items || !descriptor || descriptor.state !== 'ready' || !descriptor.version || descriptor.group === 1 || descriptor.group === 0 || !descriptor.declarator) {
                    return;
                }
                var script = String(descriptor.declarator);
                if (script.length > 1e5) {
                    return;
                }
                var srcParts = ['mw.loader.impl(', script, ');\n'];
                if (true) {
                    srcParts.push('// Saved in localStorage at ', (new Date()).toISOString(), '\n');
                    var sourceLoadScript = sources[descriptor.source];
                    var query = Object.create({
                        "lang": "ja",
                        "skin": "vector-2022"
                    });
                    query.modules = module;
                    query.version = getCombinedVersion([module]);
                    query = sortQuery(query);
                    srcParts.push('//# sourceURL=', (new URL(sourceLoadScript, location)).href, '?', makeQueryString(query), '\n');
                    query.sourcemap = '1';
                    query = sortQuery(query);
                    srcParts.push(
                    '//# sourceMappingURL=', sourceLoadScript, '?', makeQueryString(query));
                }
                this.items[key] = srcParts.join('');
                hasPendingWrites = true;
            },
            prune: function() {
                for (var key in this.items) {
                    if (getModuleKey(splitModuleKey(key).name) !== key) {
                        this.stats.expired++;
                        delete this.items[key];
                    }
                }
            },
            clear: function() {
                this.items = {};
                try {
                    localStorage.removeItem(this.key);
                } catch (e) {}
            },
            requestUpdate: function() {
                if (!hasPendingFlush) {
                    hasPendingFlush = setTimeout(function() {
                        mw.requestIdleCallback(flushWrites);
                    }, 2000);
                }
            }
        };
    }());
    mw.requestIdleCallbackInternal = function(callback) {
        setTimeout(function() {
            var start = mw.now();
            callback({
                didTimeout: false,
                timeRemaining: function() {
                    return Math.max(0, 50 - (mw.now() - start));
                }
            });
        }, 1);
    };
    mw.requestIdleCallback = window.requestIdleCallback ? window.requestIdleCallback.bind(window) : mw.requestIdleCallbackInternal;
    (function() {
        var queue;
        mw.loader.addSource({
            "local": "https://ja.wikipedia.org/w/load.php",
            "metawiki": "//meta.wikimedia.org/w/load.php"
        });
        mw.loader.register([["site", "10ds7", [1]], ["site.styles", "7kh95", [], 2], ["filepage", "1ljys"], ["user", "1tdkc", [], 0], ["user.styles", "18fec", [], 0], ["user.options", "12s5i", [], 1], ["mediawiki.skinning.interface", "vws3q"], ["jquery.makeCollapsible.styles", "1apaa"], ["mediawiki.skinning.content.parsoid", "alv4z"], ["mediawiki.skinning.typeaheadSearch", "1voh2", [34]], ["web2017-polyfills", "174re", [], null, null, "return'IntersectionObserver'in window\u0026\u0026typeof fetch==='function'\u0026\u0026typeof URL==='function'\u0026\u0026'toJSON'in URL.prototype;"], ["jquery", "xt2am"], ["mediawiki.base", "mw71f", [11]], ["jquery.chosen", "1ft2a"], ["jquery.client", "5k8ja"], ["jquery.confirmable", "1aw6f", [104]], ["jquery.highlightText", "9qzq7", [78]], ["jquery.i18n", "1tati", [103]], ["jquery.lengthLimit", "tlk9z", [61]], ["jquery.makeCollapsible", "324as", [7, 78]], ["jquery.spinner", "iute0", [21]], ["jquery.spinner.styles", "5fx4u"], ["jquery.suggestions", "69w39", [16]], ["jquery.tablesorter", "hn42t", [24, 105, 78]], ["jquery.tablesorter.styles", "19mge"], ["jquery.textSelection", "1x0f0", [14]], ["jquery.ui", "1h2xk"], ["moment", "ssu9u", [101, 78]], ["vue", "17txg", [112]], ["vuex", "16fjm", [28]], ["pinia", "17tzw", [28]], ["@wikimedia/codex", "tqv83", [32, 28]], ["codex-styles", "oa6rd"], ["mediawiki.codex.messagebox.styles", "1rdfp"], ["mediawiki.codex.typeaheadSearch", "5d4vj", [28]], ["mediawiki.template", "72v1k"], ["mediawiki.template.mustache", "1m2gq", [35]], ["mediawiki.apipretty", "qt7g6"], ["mediawiki.api", "1vnvs", [104]], ["mediawiki.content.json", "1jfrd"], ["mediawiki.confirmCloseWindow", "1b4j6"], ["mediawiki.DateFormatter", "7c1i7", [5]], ["mediawiki.debug", "1brwu", [207]], ["mediawiki.diff", "91tk9", [38]], ["mediawiki.diff.styles", "17tke"], ["mediawiki.feedback", "1dhvc", [68, 104, 860, 207, 215]], ["mediawiki.feedlink", "642xe"], ["mediawiki.filewarning", "1c1l8", [207, 219]], ["mediawiki.ForeignApi", "r63m6", [311]], ["mediawiki.ForeignApi.core", "1b34f", [38, 204]], ["mediawiki.helplink", "5t06n"], ["mediawiki.hlist", "artqm"], ["mediawiki.htmlform", "1t838", [18, 78]], ["mediawiki.htmlform.ooui", "qp5p1", [207]], ["mediawiki.htmlform.styles", "9ch34"], ["mediawiki.htmlform.codex.styles", "1og35"], ["mediawiki.htmlform.ooui.styles", "gscs5"], ["mediawiki.inspect", "2ufuk", [61, 78]], ["mediawiki.notification", "7heye", [78, 84]], ["mediawiki.notification.convertmessagebox", "1qfxt", [58]], ["mediawiki.notification.convertmessagebox.styles", "15u5e"], ["mediawiki.String", "rowro"], ["mediawiki.pager.styles", "2abvc"], ["mediawiki.pager.codex", "127kr"], ["mediawiki.pager.codex.styles", "1cmww"], ["mediawiki.pulsatingdot", "mqtzs"], ["mediawiki.searchSuggest", "1rgte", [22, 38]], ["mediawiki.storage", "1nf55", [78]], ["mediawiki.Title", "57gg0", [61, 78]], ["mediawiki.Upload", "1kc0u", [38]], ["mediawiki.ForeignUpload", "rhdxj", [48, 69]], ["mediawiki.Upload.Dialog", "1kg0w", [72]], ["mediawiki.Upload.BookletLayout", "1iaey", [69, 210, 215, 220, 221]], ["mediawiki.ForeignStructuredUpload.BookletLayout", "gpl4w", [70, 72, 108, 184, 177]], ["mediawiki.toc", "m5i3o", [81]], ["mediawiki.Uri", "q0cxk", [78]], ["mediawiki.user", "qhmrd", [38, 81]], ["mediawiki.userSuggest", "ba9yz", [22, 38]], ["mediawiki.util", "3f5g3", [14, 10]], ["mediawiki.checkboxtoggle", "11rut"], ["mediawiki.checkboxtoggle.styles", "16de4"], ["mediawiki.cookie", "oeeu3"], ["mediawiki.experiments", "15xww"], ["mediawiki.editfont.styles", "l9cd2"], ["mediawiki.visibleTimeout", "40nxy"], ["mediawiki.action.edit", "1687e", [25, 86, 83, 180]], ["mediawiki.action.edit.styles", "1xn3s"], ["mediawiki.action.edit.collapsibleFooter", "1rrl2", [19, 67]], ["mediawiki.action.edit.preview", "13s66", [20, 114]], ["mediawiki.action.history", "1c95i", [19]], ["mediawiki.action.history.styles", "1am4g"], ["mediawiki.action.protect", "ome7l", [180]], ["mediawiki.action.view.metadata", "a7uec", [99]], ["mediawiki.editRecovery.postEdit", "eap1o"], ["mediawiki.editRecovery.edit", "fvl50", [58, 176, 223]], ["mediawiki.action.view.postEdit", "1jr1m", [58, 67, 166, 207, 227]], ["mediawiki.action.view.redirect", "9jbdf"], ["mediawiki.action.view.redirectPage", "5efw8"], ["mediawiki.action.edit.editWarning", "15on3", [25, 40, 104]], ["mediawiki.action.view.filepage", "1j4h9"], ["mediawiki.action.styles", "127iq"], ["mediawiki.language", "ofwmk", [102]], ["mediawiki.cldr", "1dc8t", [103]], ["mediawiki.libs.pluralruleparser", "1sv4p"], ["mediawiki.jqueryMsg", "1b36q", [68, 101, 5]], ["mediawiki.language.months", "1h3c7", [101]], ["mediawiki.language.names", "1hi00", [101]], ["mediawiki.language.specialCharacters", "1kvpt", [101]], ["mediawiki.libs.jpegmeta", "n7h67"], ["mediawiki.page.gallery", "p8nmx", [110, 78]], ["mediawiki.page.gallery.styles", "1phit"], ["mediawiki.page.gallery.slideshow", "v1btf", [210, 230, 232]], ["mediawiki.page.ready", "x2d7t", [76]], ["mediawiki.page.watch.ajax", "mr16a", [76]], ["mediawiki.page.preview", "owjp5", [19, 25, 43, 44, 207]], ["mediawiki.page.image.pagination", "1qg8v", [20, 78]], ["mediawiki.page.media", "1oc5n"], ["mediawiki.rcfilters.filters.base.styles", "ycw13"], ["mediawiki.rcfilters.highlightCircles.seenunseen.styles", "1tp31"], ["mediawiki.rcfilters.filters.ui", "kdr72", [19, 174, 216, 223, 226, 227, 228, 230, 231]], ["mediawiki.interface.helpers.linker.styles", "1biyp"], ["mediawiki.interface.helpers.styles", "1kdh9"], ["mediawiki.special", "npmww"], ["mediawiki.special.apisandbox", "pcg6q", [19, 197, 181, 206]], ["mediawiki.special.restsandbox.styles", "tjxcg"], ["mediawiki.special.restsandbox", "y5cq1", [124]], ["mediawiki.special.block", "12v74", [52, 177, 196, 185, 197, 194, 223]], ["mediawiki.misc-authed-ooui", "l5yl7", [20, 53, 174, 180]], ["mediawiki.misc-authed-pref", "19b82", [5]], ["mediawiki.misc-authed-curate", "1mwzl", [13, 15, 18, 20, 38]], ["mediawiki.special.block.codex", "1tfjy", [31, 41, 40, 30]], ["mediawiki.protectionIndicators.styles", "mii98"], ["mediawiki.special.changeslist", "159f4"], ["mediawiki.special.changeslist.watchlistexpiry", "i1s5p", [122, 227]], ["mediawiki.special.changeslist.enhanced", "160rf"], ["mediawiki.special.changeslist.legend", "kn2e4"], ["mediawiki.special.changeslist.legend.js", "13r7x", [81]], ["mediawiki.special.contributions", "1203g", [19, 177, 206]], ["mediawiki.special.import.styles.ooui", "1nurn"], ["mediawiki.special.interwiki", "3wqp1"], ["mediawiki.special.changecredentials", "1eqrg"], ["mediawiki.special.changeemail", "q0qtr"], ["mediawiki.special.preferences.ooui", "17vng", [40, 83, 59, 67, 185, 180, 215]], ["mediawiki.special.preferences.styles.ooui", "1pgz2"], ["mediawiki.special.editrecovery.styles", "1k8hm"], ["mediawiki.special.editrecovery", "1n7dp", [28]], ["mediawiki.special.mergeHistory", "kgyee"], ["mediawiki.special.search", "5kwbo", [199]], ["mediawiki.special.search.commonsInterwikiWidget", "1q3wr", [38]], ["mediawiki.special.search.interwikiwidget.styles", "3euyd"], ["mediawiki.special.search.styles", "nky48"], ["mediawiki.special.unwatchedPages", "1009y", [38]], ["mediawiki.special.upload", "4vs5f", [20, 38, 40, 108, 122, 35]], ["mediawiki.authenticationPopup", "11crv", [20, 215]], ["mediawiki.authenticationPopup.success", "6zddp"], ["mediawiki.special.userlogin.common.styles", "l4de0"], ["mediawiki.special.userlogin.login.styles", "e4yu5"], ["mediawiki.special.userlogin.authentication-popup", "1kcgd"], ["mediawiki.special.createaccount", "glfj5", [38]], ["mediawiki.special.userlogin.signup.styles", "63cnw"], ["mediawiki.special.specialpages", "lsj8h", [207]], ["mediawiki.special.userrights", "173s1", [18, 59]], ["mediawiki.special.watchlist", "1cqru", [207, 227]], ["mediawiki.special.watchlistlabels", "9u2q5", [32]], ["mediawiki.tempUserBanner.styles", "1avoa"], ["mediawiki.tempUserBanner", "1n7hb", [104]], ["mediawiki.tempUserCreated", "117j0", [78]], ["mediawiki.ui", "19uao"], ["mediawiki.ui.checkbox", "5jkb8"], ["mediawiki.ui.radio", "9f4qn"], ["mediawiki.legacy.messageBox", "q4l46"], ["mediawiki.ui.button", "nl0o1"], ["mediawiki.ui.input", "1ml3x"], ["mediawiki.ui.icon", "8q8ay"], ["mediawiki.widgets", "1bc69", [175, 210, 220, 221]], ["mediawiki.widgets.styles", "tcu2g"], ["mediawiki.widgets.AbandonEditDialog", "1pvp3", [215]], ["mediawiki.widgets.DateInputWidget", "1wl7q", [178, 27, 210, 232]], ["mediawiki.widgets.DateInputWidget.styles", "1rb9g"], ["mediawiki.widgets.DateTimeInputWidget.styles", "1r6r1"], ["mediawiki.widgets.visibleLengthLimit", "4i5bv", [18, 207]], ["mediawiki.widgets.datetime", "s3r9q", [179, 207, 227, 231, 232]], ["mediawiki.widgets.expiry", "e4bxs", [181, 27, 210]], ["mediawiki.widgets.CheckMatrixWidget", "12rkt", [207]], ["mediawiki.widgets.CategoryMultiselectWidget", "17uff", [48, 210]], ["mediawiki.widgets.SelectWithInputWidget", "11wi8", [186, 210]], ["mediawiki.widgets.SelectWithInputWidget.styles", "qbkfg"], ["mediawiki.widgets.SizeFilterWidget", "70qrm", [188, 210]], ["mediawiki.widgets.SizeFilterWidget.styles", "14hjc"], ["mediawiki.widgets.MediaSearch", "1lqbt", [48, 210]], ["mediawiki.widgets.Table", "pkro9", [210]], ["mediawiki.widgets.TagMultiselectWidget", "1y5hq", [210]], ["mediawiki.widgets.OrderedMultiselectWidget", "1rmms", [210]], ["mediawiki.widgets.MenuTagMultiselectWidget", "5vc6y", [210]], ["mediawiki.widgets.UserInputWidget", "gkal4", [210]], ["mediawiki.widgets.UsersMultiselectWidget", "1nts9", [210]], ["mediawiki.widgets.NamespacesMultiselectWidget", "1skcg", [174]], ["mediawiki.widgets.TitlesMultiselectWidget", "1xq8g", [174]], ["mediawiki.widgets.TagMultiselectWidget.styles", "pqvgn"], ["mediawiki.widgets.SearchInputWidget", "1m94u", [66, 174, 227]], ["mediawiki.widgets.SearchInputWidget.styles", "1784o"], ["mediawiki.widgets.ToggleSwitchWidget", "1yf2l", [210]], ["mediawiki.watchstar.widgets", "1iuni", [206]], ["mediawiki.deflate", "1kmt8"], ["oojs", "1u2cw"], ["mediawiki.router", "1i4ls", [204]], ["oojs-ui", "19txf", [213, 210, 215]], ["oojs-ui-core", "5s0co", [112, 204, 209, 208, 217]], ["oojs-ui-core.styles", "1raop"], ["oojs-ui-core.icons", "4fe9l"], ["oojs-ui-widgets", "nc58x", [207, 212]], ["oojs-ui-widgets.styles", "1lno1"], ["oojs-ui-widgets.icons", "iynig"], ["oojs-ui-toolbars", "m8pkp", [207, 214]], ["oojs-ui-toolbars.icons", "ypgzq"], ["oojs-ui-windows", "nik9m", [207, 216]], ["oojs-ui-windows.icons", "93gn0"], ["oojs-ui.styles.indicators", "i4nr1"], ["oojs-ui.styles.icons-accessibility", "ioxe7"], ["oojs-ui.styles.icons-alerts", "ot4qg"], ["oojs-ui.styles.icons-content", "1bqyi"], ["oojs-ui.styles.icons-editing-advanced", "1fvbh"], ["oojs-ui.styles.icons-editing-citation", "ous4f"], ["oojs-ui.styles.icons-editing-core", "9x9fc"], ["oojs-ui.styles.icons-editing-functions", "1j6sm"], ["oojs-ui.styles.icons-editing-list", "1emyg"], ["oojs-ui.styles.icons-editing-styling", "17m0z"], ["oojs-ui.styles.icons-interactions", "1223u"], ["oojs-ui.styles.icons-layout", "1d1qq"], ["oojs-ui.styles.icons-location", "14n8l"], ["oojs-ui.styles.icons-media", "1vopr"], ["oojs-ui.styles.icons-moderation", "1yocm"], ["oojs-ui.styles.icons-movement", "1w9j3"], ["oojs-ui.styles.icons-user", "muhfj"], ["oojs-ui.styles.icons-wikimedia", "8nd50"], ["skins.vector.search.codex.styles", "1kerp"], ["skins.vector.search", "1r7g3", [9]], ["skins.vector.styles.legacy", "1tpdx"], ["skins.vector.styles", "1hzat"], ["skins.vector.icons.js", "1d9ws"], ["skins.vector.icons", "14r3j"], ["skins.vector.clientPreferences", "14d76", [76]], ["skins.vector.js", "10jm9", [82, 113, 67, 241, 239]], ["skins.vector.legacy.js", "p3nvy", [112]], ["skins.monobook.styles", "9wkxz"], ["skins.monobook.scripts", "j86g2", [76, 219]], ["skins.modern", "pb7l0"], ["skins.cologneblue", "9xsz4"], ["skins.timeless", "uf9ju"], ["skins.timeless.js", "15mj7"], ["ext.timeline.styles", "1osj7"], ["ext.wikihiero", "en84f"], ["ext.wikihiero.special", "wgqqm", [251, 20, 207]], ["ext.wikihiero.visualEditor", "1hd5q", [428]], ["ext.charinsert", "1szkj", [25]], ["ext.charinsert.styles", "17hc7"], ["ext.cite.styles", "ct0yc"], ["ext.cite.parsoid.styles", "90xyw"], ["ext.cite.ux-enhancements", "1gck1"], ["ext.cite.community-configuration", "1do7h", [28]], ["ext.citeThisPage", "cjgsj"], ["ext.inputBox", "1o09r"], ["ext.inputBox.styles", "6ogrj"], ["ext.imagemap", "lq7bt", [264]], ["ext.imagemap.styles", "118nu"], ["ext.pygments", "ztg4t"], ["ext.geshi.visualEditor", "bxdnv", [428, 221]], ["ext.categoryTree", "m5md7", [38]], ["ext.categoryTree.styles", "1birc"], ["ext.spamBlacklist.visualEditor", "1x8kv"], ["mediawiki.api.titleblacklist", "1qh9e", [38]], ["ext.titleblacklist.visualEditor", "rdabw"], ["ext.tmh.video-js", "11410"], ["ext.tmh.videojs-ogvjs", "1begb", [281, 272]], ["ext.tmh.player", "f818x", [280, 277, 68]], ["ext.tmh.player.dialog", "s9wkv", [276, 215]], ["ext.tmh.player.inline", "1h0nv", [280, 272, 68]], ["ext.tmh.player.styles", "wcxes"], ["ext.tmh.transcodetable", "wgs5z", [206]], ["ext.tmh.timedtextpage.styles", "bfqwg"], ["ext.tmh.OgvJsSupport", "kckt1"], ["ext.tmh.OgvJs", "5tcrw", [280]], ["embedPlayerIframeStyle", "zgah7"], ["ext.urlShortener.special", "yf0xh", [53, 174, 206]], ["ext.urlShortener.qrCode.special", "1p1fk", [285, 53, 174]], ["ext.urlShortener.qrCode.special.styles", "c5c14"], ["ext.urlShortener.toolbar", "1iipp"], ["ext.globalBlocking", "pi64x", [52, 174, 194]], ["ext.globalBlocking.styles", "1bh82"], ["ext.securepoll.htmlform", "12d2f", [20, 49, 174, 194, 206, 227, 228]], ["ext.securepoll", "1e5y0"], ["ext.securepoll.special", "rsbfn"], ["ext.score.visualEditor", "bjsd6", [293, 428]], ["ext.score.visualEditor.icons", "x8gyr"], ["ext.score.popup", "1hgdj", [38]], ["ext.score.styles", "1h1di"], ["ext.cirrus.serp", "1x2q2", [205, 78]], ["ext.nuke.styles", "pt4ca"], ["ext.nuke.fields.NukeDateTimeField", "1bj6x", [177]], ["ext.nuke.codex.styles", "19jdp"], ["ext.nuke.codex", "wue3c", [28]], ["ext.confirmEdit.editPreview.ipwhitelist.styles", "nwoqf"], ["ext.confirmEdit.visualEditor", "bl2yi", [838]], ["ext.confirmEdit.simpleCaptcha", "1cj5u"], ["ext.confirmEdit.fancyCaptcha.styles", "1lv38"], ["ext.confirmEdit.fancyCaptcha", "1t725", [304, 38]], ["ext.centralauth", "7a94p", [20, 78]], ["ext.centralauth.centralautologin", "q64kz", [104]], ["ext.centralauth.centralautologin.clearcookie", "1p0lv"], ["ext.centralauth.misc.styles", "jffhj"], ["ext.centralauth.globalrenameuser", "g4mmu", [78]], ["ext.centralauth.ForeignApi", "cnt0m", [49]], ["ext.widgets.GlobalUserInputWidget", "zotps", [210]], ["ext.centralauth.globalrenamequeue", "bsepa"], ["ext.centralauth.globalrenamequeue.styles", "1j97l"], ["ext.centralauth.globalvanishrequest", "c1qxh"], ["ext.GlobalUserPage", "1k1of"], ["ext.apifeatureusage", "1cero"], ["ext.dismissableSiteNotice", "1440g", [81, 78]], ["ext.dismissableSiteNotice.styles", "1itli"], ["ext.centralNotice.startUp", "16ffj", [322, 78]], ["ext.centralNotice.geoIP", "lep3c", [81]], ["ext.centralNotice.choiceData", "cztqh", [326]], ["ext.centralNotice.display", "1wim7", [321, 324, 562, 67]], ["ext.centralNotice.kvStore", "1ggs8"], ["ext.centralNotice.bannerHistoryLogger", "f5psy", [323]], ["ext.centralNotice.impressionDiet", "1vyse", [323]], ["ext.centralNotice.largeBannerLimit", "12rqy", [323]], ["ext.centralNotice.legacySupport", "18wyo", [323]], ["ext.centralNotice.bannerSequence", "1fwka", [323]], ["ext.centralNotice.freegeoipLookup", "1q1bz", [321]], ["ext.centralNotice.impressionEventsSampleRate", "1e3w6", [323]], ["ext.centralNotice.cspViolationAlert", "cbp0k"], ["ext.wikimediamessages.styles", "1vadr"], ["ext.wikimediamessages.contactpage", "1asqc"], ["ext.collection", "j4p2j", [337, 101]], ["ext.collection.bookcreator.styles", "e76ax"], ["ext.collection.bookcreator", "36j1z", [336, 67]], ["ext.collection.checkLoadFromLocalStorage", "k48ay", [335]], ["ext.collection.suggest", "kdcz3", [337]], ["ext.collection.offline", "2gmtr"], ["ext.collection.bookcreator.messageBox", "19txf", [342, 51]], ["ext.collection.bookcreator.messageBox.icons", "zs4hz"], ["ext.ElectronPdfService.special.styles", "vvfin"], ["ext.ElectronPdfService.special.selectionImages", "5xpri"], ["ext.emailauth", "1beyj"], ["ext.advancedSearch.initialstyles", "1ma78"], ["ext.advancedSearch.styles", "1coyu"], ["ext.advancedSearch.searchtoken", "1vhat", [], 1], ["ext.advancedSearch.elements", "15al4", [351, 347, 227, 228]], ["ext.advancedSearch.init", "12drd", [349, 348]], ["ext.advancedSearch.SearchFieldUI", "1e7u1", [210]], ["ext.abuseFilter", "sklv7"], ["ext.abuseFilter.edit", "1in22", [20, 25, 40, 210]], ["ext.abuseFilter.tools", "1doij", [20, 38]], ["ext.abuseFilter.examine", "lmnaw", [20, 38]], ["ext.abuseFilter.visualEditor", "1f8aq"], ["pdfhandler.messages", "p3el6"], ["ext.wikiEditor", "1701x", [25, 26, 107, 174, 222, 223, 225, 226, 230, 35], 3], ["ext.wikiEditor.styles", "pgt7x", [], 3], ["ext.wikiEditor.images", "u7sa2"], ["ext.wikiEditor.realtimepreview", "1a3xu", [358, 360, 114, 65, 67, 227]], ["ext.CodeMirror", "gbeai", [76]], ["ext.CodeMirror.WikiEditor", "fgoc5", [362, 25, 226]], ["ext.CodeMirror.lib", "1bd9x"], ["ext.CodeMirror.addons", "19bks", [364]], ["ext.CodeMirror.mode.mediawiki", "5wanr", [364]], ["ext.CodeMirror.visualEditor", "1wpnp", [362, 435]], ["ext.CodeMirror.v6", "m8tde", [370, 25, 76]], ["ext.CodeMirror.v6.init", "wmbc8", [5]], ["ext.CodeMirror.v6.lib", "10npg"], ["ext.CodeMirror.v6.mode.mediawiki", "qyqax", [368]], ["ext.CodeMirror.v6.modes", "3q7ga", [370]], ["ext.CodeMirror.v6.WikiEditor", "vfnn1", [368, 358]], ["ext.CodeMirror.v6.visualEditor", "zvxum", [368, 435]], ["ext.CodeMirror.visualEditor.init", "hqd96"], ["ext.MassMessage.styles", "11p9u"], ["ext.MassMessage.special.js", "1btd0", [18, 207]], ["ext.MassMessage.content", "1xi4c", [15, 174, 206]], ["ext.MassMessage.create", "2rskf", [40, 53, 174]], ["ext.MassMessage.edit", "hf32f", [40, 180, 206]], ["ext.betaFeatures", "ybarf", [207]], ["ext.betaFeatures.styles", "x052y"], ["mmv", "ifxh2", [387]], ["mmv.codex", "1b8f4"], ["mmv.ui.reuse", "1t2ys", [174, 384]], ["mmv.ui.restriction", "1ciap"], ["mmv.bootstrap", "d4jjb", [205, 67, 76, 384]], ["ext.popups.icons", "8a3s7"], ["ext.popups", "13p6r"], ["ext.popups.main", "dfpzr", [82, 67, 76]], ["ext.linter.edit", "1bhpr", [25]], ["ext.linter.styles", "e86ab"], ["color-picker", "1udyk"], ["rangefix", "mtvel"], ["spark-md5", "1ewgr"], ["ext.visualEditor.supportCheck", "jj8np", [], 4], ["ext.visualEditor.sanitize", "1nl3k", [417], 4], ["ext.visualEditor.progressBarWidget", "kxifz", [], 4], ["ext.visualEditor.tempWikitextEditorWidget", "vbaxg", [83, 76], 4], ["ext.visualEditor.desktopArticleTarget.init", "1jjus", [398, 396, 399, 413, 25, 112, 67], 4], ["ext.visualEditor.desktopArticleTarget.noscript", "6yllo"], ["ext.visualEditor.targetLoader", "eifh7", [416, 413, 25, 67, 76], 4], ["ext.visualEditor.desktopTarget", "1w8kr", [], 4], ["ext.visualEditor.desktopArticleTarget", "1gvvf", [420, 417, 424, 403, 418, 430, 104, 78], 4], ["ext.visualEditor.mobileArticleTarget", "djvvc", [420, 425], 4], ["ext.visualEditor.collabTarget", "oe1zm", [418, 423, 83, 174, 227, 228], 4], ["ext.visualEditor.collabTarget.desktop", "5nkpj", [406, 424, 403, 430], 4], ["ext.visualEditor.collabTarget.mobile", "115w7", [406, 425, 429], 4], ["ext.visualEditor.collabTarget.init", "11kwe", [396, 174, 206], 4], ["ext.visualEditor.collabTarget.init.styles", "1i21t"], ["ext.visualEditor.collab", "zw35e", [393, 422]], ["ext.visualEditor.ve", "19fgx", [], 4], ["ext.visualEditor.track", "10mz7", [412], 4], ["ext.visualEditor.editCheck", "1qwsk", [419], 4], ["ext.visualEditor.core.utils", "1tzv3", [413, 206], 4], ["ext.visualEditor.core.utils.parsing", "pxlsz", [412], 4], ["ext.visualEditor.base", "1pnsu", [415, 416], 4], ["ext.visualEditor.mediawiki", "ciwcp", [417, 402, 23, 593, 106], 4], ["ext.visualEditor.mwsave", "v3z3b", [428, 18, 20, 43, 44, 227], 4], ["ext.visualEditor.articleTarget", "1qp57", [429, 419, 95, 176], 4], ["ext.visualEditor.data", "5o9ed", [418]], ["ext.visualEditor.core", "92cgd", [397, 396, 394, 395], 4], ["ext.visualEditor.rebase", "cdo8o", [393, 438, 233], 4], ["ext.visualEditor.core.desktop", "t2org", [422], 4], ["ext.visualEditor.core.mobile", "1bljn", [422], 4], ["ext.visualEditor.welcome", "12f1s", [206], 4], ["ext.visualEditor.switching", "1hh8d", [206, 218, 221, 223], 4], ["ext.visualEditor.mwcore", "1hkb1", [439, 418, 427, 426, 121, 65, 8, 174], 4], ["ext.visualEditor.mwextensions", "19txf", [421, 448, 444, 431, 446, 433, 443, 434, 436], 4], ["ext.visualEditor.mwextensions.desktop", "19txf", [429, 435, 73], 4], ["ext.visualEditor.mwformatting", "2fkxw", [428], 4], ["ext.visualEditor.mwimage.core", "flz94", [428], 4], ["ext.visualEditor.mwimage", "13oc9", [449, 432, 189, 27, 230], 4], ["ext.visualEditor.mwlink", "1behy", [428], 4], ["ext.visualEditor.mwmeta", "9sgg6", [434, 97], 4], ["ext.visualEditor.mwtransclusion", "4h2zw", [428, 194], 4], ["treeDiffer", "1o9nz"], ["ext.visualEditor.checkList", "6jf4d", [422], 4], ["ext.visualEditor.diffing", "4kbjg", [422, 437], 4], ["ext.visualEditor.diffPage.init.styles", "10hx8"], ["ext.visualEditor.diffLoader", "1dei4", [402], 4], ["ext.visualEditor.diffPage.init", "stmv8", [441, 440, 206, 218, 221], 4], ["ext.visualEditor.mwlanguage", "ye58e", [422], 4], ["ext.visualEditor.mwalienextension", "1h689", [428], 4], ["ext.visualEditor.mwwikitext", "14gg0", [434, 83], 4], ["ext.visualEditor.mwgallery", "i7kpa", [428, 110, 189, 230], 4], ["ext.visualEditor.mwsignature", "155cu", [436], 4], ["ext.visualEditor.icons", "19txf", [450, 451, 219, 220, 221, 223, 225, 226, 227, 228, 231, 232, 233, 217], 4], ["ext.visualEditor.icons-licenses", "1t6cj"], ["ext.visualEditor.moduleIcons", "1cw3c"], ["ext.visualEditor.moduleIndicators", "c24wt"], ["ext.citoid.visualEditor", "mqaq3", [785, 455, 454]], ["quagga2", "1d4mk"], ["ext.citoid.visualEditor.icons", "1y101"], ["ext.citoid.visualEditor.data", "1gfz4", [418]], ["ext.citoid.wikibase.init", "t55ht"], ["ext.citoid.wikibase", "ysg13", [456, 26, 206]], ["ext.templateData", "1tt86"], ["ext.templateDataGenerator.editPage", "8oiwy"], ["ext.templateDataGenerator.data", "1in81", [204]], ["ext.templateDataGenerator.editTemplatePage.loading", "1fb90"], ["ext.templateDataGenerator.editTemplatePage", "gtgk4", [458, 463, 460, 25, 593, 210, 215, 227, 228, 231]], ["ext.templateData.images", "19z04"], ["ext.templateData.templateDiscovery", "2dnc0", [67, 174, 227, 231, 232]], ["ext.TemplateWizard", "d2pmc", [25, 174, 177, 194, 213, 215, 227]], ["ext.wikiLove.icon", "1kmne"], ["ext.wikiLove.startup", "jfekj", [31]], ["ext.wikiLove.local", "86kie"], ["ext.wikiLove.init", "ce4xb", [467]], ["mediawiki.libs.guiders", "8y7cy"], ["ext.guidedTour.styles", "a7w89", [470]], ["ext.guidedTour.lib.internal", "1hslf", [78]], ["ext.guidedTour.lib", "1skge", [472, 471, 76]], ["ext.guidedTour.launcher", "de9y5"], ["ext.guidedTour", "1u9n0", [473]], ["ext.guidedTour.tour.firstedit", "ugip7", [475]], ["ext.guidedTour.tour.test", "1muok", [475]], ["ext.guidedTour.tour.onshow", "141rp", [475]], ["ext.guidedTour.tour.uprightdownleft", "1pdgx", [475]], ["skins.minerva.styles", "kntqt"], ["skins.minerva.content.styles.images", "1sowp"], ["skins.minerva.amc.styles", "1vqc6"], ["skins.minerva.overflow.icons", "1vie9"], ["skins.minerva.icons", "31wsw"], ["skins.minerva.mainPage.styles", "1wl5z"], ["skins.minerva.userpage.styles", "1dm31"], ["skins.minerva.personalMenu.icons", "mmgef"], ["skins.minerva.mainMenu.advanced.icons", "s2whe"], ["skins.minerva.loggedin.styles", "oxi42"], ["skins.minerva.search", "hhhaf", [205, 9]], ["skins.minerva.scripts", "44pr3", [41, 82, 500, 484, 480]], ["skins.minerva.categories.styles", "q4l46"], ["skins.minerva.codex.styles", "4uyns"], ["mobile.pagelist.styles", "73j6y"], ["mobile.pagesummary.styles", "e3ldu"], ["mobile.userpage.styles", "kop2t"], ["mobile.init.styles", "qatjo"], ["mobile.init", "17vmd", [500]], ["mobile.codex.styles", "3wfgz"], ["mobile.startup", "1xp8q", [113, 205, 67, 36, 499, 497, 495]], ["mobile.editor.overlay", "j6p8j", [95, 40, 83, 176, 500, 206, 223]], ["mobile.mediaViewer", "roj53", [500]], ["mobile.languages.structured", "q8mbl", [500]], ["mobile.special.styles", "1gbn5"], ["mobile.special.watchlist.scripts", "1u7vx", [500]], ["mobile.special.codex.styles", "1dzg6"], ["mobile.special.mobileoptions.styles", "eatlz"], ["mobile.special.mobileoptions.scripts", "eb3d3", [500]], ["mobile.special.userlogin.scripts", "1lhsb"], ["ext.math.mathjax", "1euus", [], 5], ["ext.math.styles", "rrzdl"], ["ext.math.popup", "fssud", [48, 76]], ["mw.widgets.MathWbEntitySelector", "6w3bw", [48, 174, 784, 215]], ["ext.math.visualEditor", "1lxpu", [511, 428]], ["ext.math.visualEditor.mathSymbols", "19vss"], ["ext.math.visualEditor.chemSymbols", "16hgh"], ["ext.babel", "ndy4d"], ["ext.echo.ui.desktop", "1d2gw", [525, 519, 38, 76, 78]], ["ext.echo.ui", "u5u27", [520, 848, 210, 219, 220, 223, 227, 231, 232, 233]], ["ext.echo.dm", "g0fu0", [523, 27]], ["ext.echo.api", "1p7hc", [48]], ["ext.echo.mobile", "jnd05", [519, 205]], ["ext.echo.init", "j4cla", [521]], ["ext.echo.centralauth", "w08f7"], ["ext.echo.styles.badge", "1pwt3"], ["ext.echo.styles.notifications", "ouaqa"], ["ext.echo.styles.alert", "1wwx5"], ["ext.echo.special", "i19xp", [529, 519]], ["ext.echo.styles.special", "rfzdo"], ["ext.thanks", "1fjuv", [38, 81]], ["ext.thanks.corethank", "we85h", [530, 15, 215]], ["ext.thanks.flowthank", "14zfk", [530, 215]], ["ext.disambiguator", "1xj7r", [38, 58]], ["ext.disambiguator.visualEditor", "1ryuk", [435]], ["ext.discussionTools.init.styles", "t4pfz"], ["ext.discussionTools.debug.styles", "xf7lx"], ["ext.discussionTools.init", "vfqwl", [535, 538, 416, 67, 27, 215, 394]], ["ext.discussionTools.minervaicons", "1fz07"], ["ext.discussionTools.debug", "mlyrl", [537]], ["ext.discussionTools.ReplyWidget", "nbjmg", [838, 537, 420, 447, 445, 180]], ["ext.codeEditor", "y9gwb", [543], 3], ["ext.codeEditor.styles", "12iuk"], ["jquery.codeEditor", "2alh1", [545, 544, 358, 215], 3], ["ext.codeEditor.icons", "pnl4g"], ["ext.codeEditor.ace", "1r0xu", [], 6], ["ext.codeEditor.ace.modes", "mhtcs", [545], 6], ["ext.scribunto.errors", "1eklx", [210]], ["ext.scribunto.logs", "7b36r"], ["ext.scribunto.edit", "6bzzl", [20, 38]], ["ext.relatedArticles.styles", "1kvq9"], ["ext.relatedArticles.readMore.bootstrap", "1ej6q", [76]], ["ext.relatedArticles.readMore", "1ae8v", [78]], ["ext.RevisionSlider.lazyCss", "1bx0r"], ["ext.RevisionSlider.lazyJs", "1akeb", [556, 232]], ["ext.RevisionSlider.init", "1dbe2", [556, 557, 27, 231]], ["ext.RevisionSlider.Settings", "1xpil", [67, 76]], ["ext.RevisionSlider.Slider", "14p4i", [558, 26, 41, 206, 227, 232]], ["ext.RevisionSlider.dialogImages", "guexg"], ["ext.TwoColConflict.SplitJs", "16owp", [561, 65, 67, 206, 227]], ["ext.TwoColConflict.SplitCss", "1710y"], ["ext.TwoColConflict.Split.TourImages", "1tiik"], ["ext.eventLogging", "y15lj", [566, 76]], ["ext.eventLogging.debug", "k60ot"], ["ext.eventLogging.jsonSchema", "17xxu"], ["ext.eventLogging.jsonSchema.styles", "1245m"], ["ext.eventLogging.metricsPlatform", "112pl"], ["ext.wikimediaEvents", "19dxw", [570, 82, 67, 84]], ["ext.wikimediaEvents.wikibase", "1r3lq", [562, 82]], ["ext.wikimediaEvents.networkprobe", "x0l64", [562]], ["ext.wikimediaEvents.xLab", "ougvk", [562]], ["ext.wikimediaEvents.WatchlistBaseline", "gyxps", [570]], ["ext.navigationTiming", "1u0am", [562]], ["ext.uls.common", "1e932", [593, 67, 76]], ["ext.uls.compactlinks", "1ufg9", [573]], ["ext.uls.ime", "1nekq", [573, 583, 584, 585, 591]], ["ext.uls.displaysettings", "19kb6", [575, 582, 583, 589, 591, 38, 76]], ["ext.uls.geoclient", "16oj3", [81]], ["ext.uls.i18n", "1m5zg", [17, 78]], ["ext.uls.interface", "1lunw", [589, 204]], ["ext.uls.interlanguage", "1pqg6"], ["ext.uls.languagenames", "frkzu"], ["ext.uls.languagesettings", "1r29g", [584, 585, 594]], ["ext.uls.mediawiki", "3jja3", [573, 581, 584, 589, 592]], ["ext.uls.messages", "q71xi", [578]], ["ext.uls.preferences", "bjbh2", [67, 76]], ["ext.uls.preferencespage", "fwsgu"], ["ext.uls.pt", "smynj"], ["ext.uls.setlang", "ig9ut", [31]], ["ext.uls.webfonts", "86xg2", [585]], ["ext.uls.webfonts.repository", "1lur0"], ["jquery.ime", "atila"], ["jquery.uls", "conkg", [17, 593, 594]], ["jquery.uls.data", "157ok"], ["jquery.uls.grid", "1u2od"], ["rangy.core", "18ohu"], ["ext.cx.contributions", "1vdej", [207, 220, 221]], ["ext.cx.model", "115fa"], ["sx.publishing.followup", "1n0fh", [604, 602, 28]], ["ext.cx.articlefilters", "ohedc"], ["mw.cx3", "o0z91", [599, 604, 603, 602, 29]], ["mw.cx3.ve", "1bvqm", [785, 405]], ["mw.cx.util", "jvaws", [597, 76]], ["mw.cx.eventlogging", "bhdlw"], ["mw.cx.SiteMapper", "3goe4", [597, 48, 76]], ["ext.cx.wikibase.link", "y6dvw"], ["ext.cx.uls.quick.actions", "1w1vo", [573, 579, 604]], ["ext.cx.eventlogging.campaigns", "19v0k", [76]], ["ext.cx.interlanguagelink.init", "1ihfp", [573]], ["ext.cx.interlanguagelink", "r6tn1", [573, 604, 210, 227]], ["ext.cx.entrypoints.recentedit", "1fzwo", [593, 604, 602, 28]], ["ext.cx.entrypoints.recenttranslation", "kofr6", [31, 593, 205, 604, 602]], ["ext.cx.entrypoints.newarticle", "k6bbt", [624, 171, 207]], ["ext.cx.entrypoints.newarticle.veloader", "1yrcp"], ["ext.cx.entrypoints.languagesearcher.init", "1qnv0"], ["ext.cx.entrypoints.languagesearcher.legacy", "1wakd", [593, 604]], ["ext.cx.entrypoints.languagesearcher", "z61xl", [593, 604, 28]], ["ext.cx.entrypoints.mffrequentlanguages", "1mnvp", [604]], ["ext.cx.entrypoints.ulsrelevantlanguages", "o8j3o", [573, 604, 28]], ["ext.cx.entrypoints.newbytranslation", "1ocif", [593, 604, 602, 28]], ["ext.cx.entrypoints.newbytranslation.mobile", "ioqgr", [604, 602, 220]], ["ext.cx.betafeature.init", "152oe"], ["ext.cx.entrypoints.contributionsmenu", "1yipv", [104]], ["ext.cx.widgets.spinner", "1psl1", [597]], ["ext.cx.widgets.callout", "fxj1q"], ["mw.cx.dm", "1iamc", [597, 204]], ["mw.cx.dm.Translation", "1efvp", [625]], ["mw.cx.SectionMappingService", "e40s2", [12, 604]], ["mw.cx.ui", "11zsk", [597, 206]], ["mw.cx.visualEditor", "171cu", [785, 424, 403, 430, 627, 630, 631]], ["ve.ce.CXLintableNode", "av1wq", [422]], ["ve.dm.CXLintableNode", "sgukm", [422, 625]], ["mw.cx.init", "1nvxj", [623, 435, 627, 603, 638, 634, 630, 631, 633]], ["ve.init.mw.CXTarget", "1rvyh", [424, 604, 626, 628, 602]], ["mw.cx.ui.Infobar", "toi7x", [628, 602, 219, 227]], ["mw.cx.ui.CaptchaDialog", "ck2vs", [850, 628]], ["mw.cx.ui.LoginDialog", "tmx3q", [628]], ["mw.cx.tools.InstructionsTool", "a5qom", [638, 36]], ["mw.cx.tools.TranslationTool", "gnek4", [628]], ["mw.cx.ui.FeatureDiscoveryWidget", "gbijs", [65, 628]], ["mw.cx.skin", "12x7c"], ["mint.styles", "70p37"], ["mint.app", "nrgyj", [31, 593, 604]], ["ext.ax.articlefooter.entrypoint", "sklpj", [604, 28]], ["mw.externalguidance.init", "19txf"], ["mw.externalguidance", "808ey", [48, 500, 646, 223]], ["mw.externalguidance.icons", "59tr8"], ["mw.externalguidance.special", "jz2gm", [32, 593, 48, 646]], ["wikibase.client.init", "lju5u"], ["wikibase.client.miscStyles", "4nyqx"], ["wikibase.client.vector-2022", "1dyxf"], ["wikibase.client.linkitem.init", "19oet", [20]], ["jquery.wikibase.linkitem", "1o30q", [20, 26, 48, 784, 783, 851]], ["wikibase.client.action.edit.collapsibleFooter", "1e4wq", [19, 67]], ["ext.wikimediaBadges", "mw79h"], ["ext.TemplateSandbox.top", "wnclz"], ["ext.TemplateSandbox", "1ysul", [655]], ["ext.TemplateSandbox.preview", "zkyd4", [20, 114]], ["ext.TemplateSandbox.visualeditor", "pckys", [174, 206]], ["ext.jsonConfig", "jqow2"], ["ext.jsonConfig.edit", "r25v8", [25, 190, 215]], ["ext.chart.styles", "fwz76"], ["ext.chart.bootstrap", "1u8y5", [10]], ["ext.chart.render", "fabnu"], ["ext.chart.visualEditor", "g5tzf", [436]], ["ext.MWOAuth.styles", "1vi1a"], ["ext.MWOAuth.AuthorizeDialog", "13rzz", [215]], ["ext.oath.totpenable.styles", "5g8kg"], ["ext.oath.recovery.styles", "ddfqo"], ["ext.oath.recovery", "ifuiu"], ["ext.oath.manage.styles", "14zrj"], ["ext.webauthn.ui.base", "le72w", [672, 206]], ["ext.webauthn.ui.base.styles", "zdmt9"], ["ext.webauthn.register", "11lpi", [671]], ["ext.webauthn.login", "1wwd4", [671]], ["ext.webauthn.manage", "iivwx", [671]], ["ext.checkUser.suggestedInvestigations.styles", "1ho6u"], ["ext.checkUser.userInfoCard", "1ekfu", [31, 41, 12]], ["ext.checkUser.clientHints", "17cf7", [38, 12]], ["ext.checkUser.tempAccounts", "1oyei", [67, 174, 194]], ["ext.checkUser.images", "1xww1"], ["ext.checkUser", "hw29v", [23, 62, 67, 174, 223, 227, 229, 231, 233]], ["ext.checkUser.styles", "1pmi8"], ["ext.ipInfo", "7onyd", [52, 67, 210, 220]], ["ext.ipInfo.styles", "19tag"], ["ext.ipInfo.specialIpInfo", "1fp6z"], ["ext.quicksurveys.lib", "upojp", [20, 82, 67, 76]], ["ext.quicksurveys.lib.vue", "zn03o", [31, 686]], ["ext.quicksurveys.init", "13zq8", [686]], ["ext.kartographer", "1h6se"], ["ext.kartographer.style", "3rnq5"], ["ext.kartographer.site", "1rxn9"], ["mapbox", "7xtpf"], ["leaflet.draw", "1plz8", [692]], ["ext.kartographer.link", "35d14", [696, 205]], ["ext.kartographer.box", "siivi", [697, 708, 691, 690, 700, 38, 230]], ["ext.kartographer.linkbox", "2q5eb", [700]], ["ext.kartographer.data", "32pzq"], ["ext.kartographer.dialog", "10wxk", [692, 205, 210, 215]], ["ext.kartographer.dialog.sidebar", "tevbu", [67, 227, 232]], ["ext.kartographer.util", "1f0vy", [689]], ["ext.kartographer.frame", "abb3f", [695, 205]], ["ext.kartographer.staticframe", "nl0ae", [696, 205, 230]], ["ext.kartographer.preview", "h5dgu"], ["ext.kartographer.editing", "1hapb", [38]], ["ext.kartographer.editor", "19txf", [695, 693]], ["ext.kartographer.visualEditor", "20iwz", [700, 428, 229]], ["ext.kartographer.lib.leaflet.markercluster", "7fwoo", [692]], ["ext.kartographer.lib.topojson", "kkikj", [692]], ["ext.kartographer.wv", "1ml5f", [692, 223]], ["ext.kartographer.specialMap", "kjbdy"], ["ext.3d", "bw2ii", [20]], ["ext.3d.styles", "jvyl2"], ["mmv.3d", "dujwu", [711, 383]], ["mmv.3d.head", "b3ac5", [711, 207, 218, 220]], ["ext.3d.special.upload", "1p8c3", [716, 152]], ["ext.3d.special.upload.styles", "4pnv1"], ["ext.readingLists.special.styles", "1a9nj"], ["ext.readingLists.api", "yqk0p", [38]], ["ext.readingLists.special", "1o0ac", [718, 28]], ["ext.readingLists.bookmark.styles", "b0afu"], ["ext.readingLists.bookmark", "125oy", [718, 722, 67]], ["ext.readingLists.bookmark.icons", "q52ah"], ["ext.readingLists.onboarding", "1x03n", [67, 28]], ["ext.GlobalPreferences.global", "333fg", [174, 183, 195]], ["ext.GlobalPreferences.local", "nvd1y"], ["ext.GlobalPreferences.global-nojs", "kg98t"], ["ext.GlobalPreferences.local-nojs", "hlt0w"], ["ext.growthExperiments.NotificationsTracking", "1puvn"], ["ext.growthExperiments.mobileMenu.icons", "1qlae"], ["ext.growthExperiments.SuggestedEditSession", "1xxsh", [67, 76, 204]], ["ext.growthExperiments.LevelingUp.InviteToSuggestedEdits", "1tu1w", [207, 232]], ["ext.growthExperiments.HelpPanelCta.styles", "tlpwp"], ["ext.growthExperiments.HomepageDiscovery.styles", "kdrfa"], ["ext.growthExperiments.HomepageDiscovery", "wf46j"], ["ext.growthExperiments.Homepage.mobile", "1avyf", [738, 500]], ["ext.growthExperiments.Homepage", "1kp2w", [215]], ["ext.growthExperiments.Homepage.Impact", "1asmr", [31, 27]], ["ext.growthExperiments.Homepage.Mentorship", "tr16s", [745, 730, 205]], ["ext.growthExperiments.Homepage.SuggestedEdits", "1d8nz", [756, 730, 65, 205, 210, 215, 220, 223, 230]], ["ext.growthExperiments.Homepage.styles", "1ch4y"], ["ext.growthExperiments.StructuredTask", "149hq", [744, 751, 434, 205, 230, 231, 232]], ["ext.growthExperiments.StructuredTask.desktop", "1wnok", [741, 404]], ["ext.growthExperiments.StructuredTask.mobile", "fgcse", [741, 405]], ["ext.growthExperiments.StructuredTask.PreEdit", "cuhhx", [31, 756, 730, 210, 215]], ["ext.growthExperiments.Help", "1jqqb", [756, 751, 67, 210, 215, 219, 221, 222, 223, 227, 233]], ["ext.growthExperiments.HelpPanel", "6i9tt", [745, 732, 744, 65, 232]], ["ext.growthExperiments.HelpPanel.init", "bu2f7", [730]], ["ext.growthExperiments.PostEdit", "1wh88", [756, 730, 751, 215, 230, 232]], ["ext.growthExperiments.Account", "zcyqc", [205, 210]], ["ext.growthExperiments.Account.styles", "ewpzh"], ["ext.growthExperiments.icons", "19vcq"], ["ext.growthExperiments.MentorDashboard", "lz1lm", [31, 751, 106, 194, 27, 215, 222, 223, 227, 230, 231, 232, 233, 29]], ["ext.growthExperiments.MentorDashboard.styles", "19nqh"], ["ext.growthExperiments.MentorDashboard.Discovery", "ls0i0", [65]], ["ext.growthExperiments.MentorDashboard.PostEdit", "oi8wx", [58]], ["ext.growthExperiments.DataStore", "rn9zo", [207]], ["ext.growthExperiments.MidEditSignup", "sqr7b", [67, 215]], ["ext.campaignEvents.specialPages", "1bh61", [19, 195, 181, 215, 28]], ["ext.campaignEvents.specialPages.styles", "104xu"], ["ext.campaignEvents.eventpage.styles", "16fge"], ["ext.campaignEvents.eventpage", "qe987", [210, 215]], ["ext.campaignEvents.postEdit", "7r88m", [28]], ["ext.campaignEvents.fy25-we211", "1h7nn", [11]], ["ext.nearby.styles", "2k4sl"], ["ext.nearby.scripts", "oficb", [31, 766, 205]], ["ext.nearby.images", "2kiuu"], ["ext.phonos.init", "1gsyh"], ["ext.phonos", "jxydw", [769, 767, 770, 207, 211, 230]], ["ext.phonos.icons.js", "1cld3"], ["ext.phonos.styles", "1dyoi"], ["ext.phonos.icons", "3ymzi"], ["ext.parsermigration.edit", "dv4zr"], ["ext.parsermigration.notice", "1me7o", [78]], ["ext.parsermigration.indicator", "wo6nn"], ["ext.parsermigration.reportbug.init", "as57t", [76]], ["ext.parsermigration.reportbug.dialog", "w4lxc", [860, 28]], ["ext.communityConfiguration.Dashboard", "wul42"], ["ext.communityConfiguration.Editor.styles", "1jroo"], ["ext.communityConfiguration.Editor.common", "ba5n5", [28]], ["ext.communityConfiguration.Editor", "1n231", [779, 48]], ["ext.xLab", "1x1co", [562]], ["mw.config.values.wbCurrentSiteDetails", "mjfji"], ["mw.config.values.wbSiteDetails", "152mz"], ["mw.config.values.wbRepo", "18lj4"], ["ext.cite.visualEditor", "140aa", [257, 256, 436, 219, 222, 227]], ["ext.cite.wikiEditor", "821kc", [358]], ["ext.cite.referencePreviews", "14qyt", [390]], ["ext.pygments.view", "12enu", [68]], ["ext.gadget.Navigation_popups", "15cl3", [76], 2], ["ext.gadget.removeAccessKeys", "fubu8", [3, 78], 2], ["ext.gadget.exlinks", "1mhyr", [78], 2], ["ext.gadget.ScrolledReflist", "p69cc", [], 2], ["ext.gadget.ReferenceTooltips", "1uujz", [81, 14], 2], ["ext.gadget.searchFocus", "ktga3", [], 2], ["ext.gadget.NormalizeCharWidth", "1j3mz", [], 2], ["ext.gadget.UsernameReplace", "17bz5", [], 2], ["ext.gadget.MarkAdmins", "q0k39", [48, 58, 210], 2], ["ext.gadget.MarkBLocked-core", "gqd0p", [48, 67, 26, 206, 231], 2], ["ext.gadget.MarkBLocked", "1lp00", [48, 67, 26, 206, 231], 2], ["ext.gadget.ConfirmLogout", "1egbx", [67, 215], 2], ["ext.gadget.edittop", "1ehqa", [5, 78], 2], ["ext.gadget.wikEd", "v3g7y", [], 2], ["ext.gadget.ProveIt", "r51lj", [], 2], ["ext.gadget.suppressEnterAtSummaryBox", "1tx1r", [], 2], ["ext.gadget.SummaryEnterPreview", "1psf5", [], 2], ["ext.gadget.HotCat", "qhzz5", [], 2], ["ext.gadget.ForkAPage", "3wqjv", [78], 2], ["ext.gadget.vpTagHelper", "113sn", [78], 2], ["ext.gadget.checkSignature", "fpscn", [215], 2], ["ext.gadget.checkSignature-suppressWhenMinor", "10tcd", [], 2], ["ext.gadget.modifyEditsection", "180q2", [36, 75], 2], ["ext.gadget.charinsert", "dleo6", [], 2], ["ext.gadget.charinsert-core", "gfem8", [25, 3, 67], 2], ["ext.gadget.MovePageWarnings", "123ao", [38], 2], ["ext.gadget.OldDiff", "1cvhl", [], 2], ["ext.gadget.UTCLiveClock", "1v65z", [38], 2], ["ext.gadget.CommentsInLocalTime", "1yomu", [], 2], ["ext.gadget.PDFLinkIcon", "7pysh", [], 2], ["ext.gadget.DisambiguationColors", "l0gxb", [], 2], ["ext.gadget.RedirectColor", "monac", [], 2], ["ext.gadget.dark-mode", "kt6sl", [], 2], ["ext.gadget.dark-mode-toggle", "qh0ox", [38, 75, 67], 2], ["ext.gadget.dark-mode-toggle-pagestyles", "1jdih", [], 2], ["ext.gadget.rollbackBot", "2ks7v", [78], 2], ["ext.gadget.MassRollback", "96ga9", [206], 2], ["ext.gadget.MassRevisionDelete", "sgbmx", [19, 206, 232], 2], ["ext.gadget.MassProtect", "1yeeu", [76, 26], 2], ["ext.gadget.AbuseFilterFalsePositiveLink", "hpnsy", [78], 2], ["ext.gadget.contribsrange", "1h540", [78, 20], 2], ["ext.gadget.WikiMiniAtlas", "uvafh", [], 2], ["ext.gadget.switcher", "zibs6", [], 2], ["ext.gadget.protectionIndicator", "mdc6n", [], 2], ["ext.gadget.protectionLog", "124n3", [], 2], ["ext.gadget.testPackage", "d0l1s", [], 2], ["ext.gadget.WpLibExtra", "1o30t", [], 2], ["ext.gadget.ip-wiki", "en5av", [], 2], ["ext.gadget.selectorLogoutLink", "19smf", [], 2], ["ext.confirmEdit.CaptchaInputWidget", "1a4oi", [207]], ["ext.confirmEdit.hCaptcha", "1i2rq", [32, 10]], ["ext.confirmEdit.hCaptcha.styles", "55cmb"], ["ext.globalCssJs.user", "1son6", [], 0, "metawiki"], ["ext.globalCssJs.user.styles", "1son6", [], 0, "metawiki"], ["ext.wikimediaMessages.ipInfo.hooks", "gjqav", [683]], ["ext.abuseFilter.ace", "6vn7c", [545]], ["ext.visualEditor.editCheck.experimental", "1wkmz", [414], 4], ["ext.guidedTour.tour.firsteditve", "lcozf", [475]], ["ext.echo.emailicons", "pzzre"], ["ext.echo.secondaryicons", "1k16a"], ["ext.wikimediaEvents.visualEditor", "19w1w", [402]], ["mw.cx.externalmessages", "17s80"], ["wikibase.Site", "1aijp", [583]], ["ext.checkUser.tempAccountOnboarding", "ath5i", [31]], ["ext.checkUser.ipInfo.hooks", "7j6jm"], ["ext.checkUser.suggestedInvestigations", "7di16", [31, 18, 12]], ["ext.quicksurveys.survey.Automatic.Translation.Feedback", "1y1f1", [687]], ["ext.guidedTour.tour.helppanel", "1rkj7", [475]], ["ext.guidedTour.tour.homepage_mentor", "k16jk", [475]], ["ext.guidedTour.tour.homepage_welcome", "zbpv9", [475]], ["ext.guidedTour.tour.homepage_discovery", "eu4ah", [475]], ["mediawiki.messagePoster", "1d2qc", [48]]]);
        mw.config.set(window.RLCONF || {});
        mw.loader.state(window.RLSTATE || {});
        mw.loader.load(window.RLPAGEMODULES || []);
        queue = window.RLQ || [];
        RLQ = [];
        RLQ.push = function(fn) {
            if (typeof fn === 'function') {
                fn();
            } else {
                RLQ[RLQ.length] = fn;
            }
        };
        while (queue[0]) {
            RLQ.push(queue.shift());
        }
        NORLQ = {
            push: function() {}
        };
    }());
}
