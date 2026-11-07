/* ==========================================================================
   Piensa Brand Docs — editor
   - Historial: deshacer / rehacer / restablecer (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z).
   - Guardado automático en disco cuando el documento se abre con abrir-editor.cmd
     (servidor local _editor/serve.js). Abierto con doble clic (file://) o en la
     copia compilada, edita igual pero avisa que no guarda.
   - Si el archivo cambia en disco (p. ej. lo edita Claude) y no hay cambios
     locales, la página se recarga sola conservando la posición.

   Qué se guarda: sólo el contenido, el estilo y la clase de los elementos
   [contenteditable="true"]. Se toma el HTML original del disco y se le
   reemplazan esos elementos, así nada de lo que los scripts agregan en tiempo
   de ejecución (estilos de Tailwind, zoom, guías) termina en el archivo.
   ========================================================================== */
(function () {
    'use strict';
    if (window.__pdEditor) return;

    var API = '/__pd/';
    var SEL = '[contenteditable="true"]';
    var HISTORY_MAX = 200;
    var COMMIT_DELAY = 350;   // ms sin cambios para cerrar un paso del historial
    var SAVE_DELAY = 900;     // ms sin cambios para guardar
    var POLL_MS = 2500;       // control de cambios externos en disco

    var isCompiled = document.documentElement.hasAttribute('data-pd-compiled');
    var docPath = decodeURIComponent(location.pathname);
    var fileName = docPath.split('/').pop() || 'documento';

    var st = {
        mode: 'init',          // init | server | offline | compiled
        baseHtml: null, baseHash: null,
        dirty: false, saving: false, queued: false,
        saveSeq: 0, lastSaved: null,
        error: null, conflict: false, disconnected: false
    };

    /* ------------------------------------------------------------------ */
    /* Utilidades                                                          */
    /* ------------------------------------------------------------------ */
    function el(tag, cls, html) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function hhmm(d) { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    function setAttr(node, name, val) { if (val == null) node.removeAttribute(name); else node.setAttribute(name, val); }
    function session(key, val) {
        try {
            if (val === undefined) { var v = sessionStorage.getItem(key); sessionStorage.removeItem(key); return v ? JSON.parse(v) : null; }
            sessionStorage.setItem(key, JSON.stringify(val));
        } catch (e) { return null; }
    }

    /* ------------------------------------------------------------------ */
    /* Toasts                                                              */
    /* ------------------------------------------------------------------ */
    var ICONS = { success: 'fa-circle-check', info: 'fa-circle-info', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark' };
    var toastBox = null;
    function toast(o) {
        var type = o.type || 'info';
        var duration = o.duration == null ? 4500 : o.duration;
        if (!toastBox) { toastBox = el('div', 'pde-toasts no-print'); toastBox.setAttribute('aria-live', 'polite'); document.body.appendChild(toastBox); }
        if (o.id) { var prev = toastBox.querySelector('[data-id="' + o.id + '"]'); if (prev) prev.remove(); }
        while (toastBox.children.length >= 3) toastBox.firstElementChild.remove();

        var t = el('div', 'pde-toast t-' + type);
        if (o.id) t.setAttribute('data-id', o.id);
        t.setAttribute('role', type === 'error' ? 'alert' : 'status');
        t.innerHTML =
            '<span class="pde-toast-icon"><i class="fa-solid ' + (o.icon || ICONS[type]) + '"></i></span>' +
            '<div><div class="pde-toast-title">' + esc(o.title) + '</div>' +
            (o.msg ? '<div class="pde-toast-msg">' + o.msg + '</div>' : '') + '</div>' +
            '<button class="pde-toast-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button>';
        if (o.action) {
            var a = el('button', 'pde-toast-action', esc(o.action.label) + ' <i class="fa-solid fa-arrow-right"></i>');
            a.onclick = function () { if (!o.action.keepOpen) close(); o.action.run(a); };
            t.children[1].appendChild(a);
        }
        var timer = null, remaining = duration, started = 0;
        function close() {
            if (!t.isConnected || t.classList.contains('is-leaving')) return;
            clearTimeout(timer); t.classList.add('is-leaving');
            setTimeout(function () { t.remove(); }, 260);
        }
        function run() { started = Date.now(); timer = setTimeout(close, remaining); }
        if (duration > 0) {
            var bar = el('div', 'pde-toast-bar'); bar.style.animationDuration = duration + 'ms'; t.appendChild(bar);
            t.addEventListener('mouseenter', function () { clearTimeout(timer); remaining -= Date.now() - started; });
            t.addEventListener('mouseleave', run);
            run();
        }
        t.querySelector('.pde-toast-close').onclick = close;
        toastBox.appendChild(t);
        return { close: close };
    }

    /* ------------------------------------------------------------------ */
    /* Modal                                                               */
    /* ------------------------------------------------------------------ */
    function modal(o) {
        return new Promise(function (resolve) {
            var type = o.type || 'info';
            var ov = el('div', 'pde-overlay no-print');
            var box = el('div', 'pde-modal t-' + type);
            box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
            box.innerHTML =
                '<div class="pde-modal-icon"><i class="fa-solid ' + (o.icon || ICONS[type]) + '"></i></div>' +
                '<h2 class="pde-modal-title">' + esc(o.title) + '</h2>' +
                '<div class="pde-modal-body">' + o.html + '</div>';
            var actions = el('div', 'pde-modal-actions');
            var buttons = (o.actions || [{ label: 'Entendido', variant: 'primary', value: true }]).map(function (a) {
                var b = el('button', 'pde-mbtn pde-mbtn-' + (a.variant || 'secondary'), (a.icon ? '<i class="fa-solid ' + a.icon + '"></i>' : '') + esc(a.label));
                b.onclick = function () { done(a.value); };
                actions.appendChild(b);
                return { b: b, a: a };
            });
            box.appendChild(actions); ov.appendChild(box);
            var lastFocus = document.activeElement;
            function done(v) {
                document.removeEventListener('keydown', onKey, true);
                ov.classList.add('is-leaving');
                setTimeout(function () { ov.remove(); if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }, 180);
                resolve(v);
            }
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
                else if (e.key === 'Tab') {
                    var bs = buttons.map(function (x) { return x.b; });
                    var i = bs.indexOf(document.activeElement);
                    e.preventDefault(); bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
                }
                else if ((e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); }
            }
            ov.addEventListener('mousedown', function (e) { if (e.target === ov) done(null); });
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(ov);
            var primary = buttons.filter(function (x) { return x.a.variant === 'primary' || x.a.variant === 'danger'; }).pop() || buttons[buttons.length - 1];
            setTimeout(function () { primary.b.focus(); }, 30);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Historial                                                           */
    /* ------------------------------------------------------------------ */
    function topLevel(root) {
        return Array.prototype.filter.call(root.querySelectorAll(SEL), function (n) {
            return !(n.parentElement && n.parentElement.closest(SEL));
        });
    }
    var editables = [];
    var hist = [], idx = 0, commitTimer = null, suppress = false;

    function snap() { return editables.map(function (n) { return [n.innerHTML, n.getAttribute('style'), n.getAttribute('class')]; }); }
    function same(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1] || a[i][2] !== b[i][2]) return false;
        return true;
    }
    function apply(s) {
        suppress = true;
        editables.forEach(function (n, i) {
            if (n.innerHTML !== s[i][0]) n.innerHTML = s[i][0];
            setAttr(n, 'style', s[i][1]); setAttr(n, 'class', s[i][2]);
        });
        observer.takeRecords();
        suppress = false;
    }
    function scheduleCommit() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, COMMIT_DELAY); }
    function commit() {
        clearTimeout(commitTimer); commitTimer = null;
        var s = snap();
        if (same(s, hist[idx])) return false;
        hist = hist.slice(0, idx + 1); hist.push(s);
        if (hist.length > HISTORY_MAX) hist.splice(1, 1);   // se conserva siempre el estado inicial
        idx = hist.length - 1;
        changed();
        return true;
    }
    function flush() { if (commitTimer) commit(); }
    function undo() { flush(); if (idx > 0) { idx--; apply(hist[idx]); changed(); } }
    function redo() { flush(); if (idx < hist.length - 1) { idx++; apply(hist[idx]); changed(); } }
    function hasChangesSinceOpen() { flush(); return !same(snap(), hist[0]); }

    function resetAll() {
        if (!hasChangesSinceOpen()) {
            toast({ type: 'info', title: 'Nada para restablecer', msg: 'El documento está igual que cuando lo abriste.', duration: 3000, id: 'reset' });
            return;
        }
        modal({
            type: 'warn', icon: 'fa-clock-rotate-left',
            title: '¿Restablecer el documento?',
            html: '<p>Vuelve todos los textos y colores a como estaban <strong>cuando abriste el documento</strong>.</p>' +
                  '<p>Si te arrepentís, lo podés deshacer con <code>Ctrl+Z</code>.</p>',
            actions: [
                { label: 'Cancelar', variant: 'secondary', value: false },
                { label: 'Restablecer', variant: 'danger', icon: 'fa-clock-rotate-left', value: true }
            ]
        }).then(function (ok) {
            if (!ok) return;
            apply(hist[0]); commit();
            toast({ type: 'success', title: 'Documento restablecido', msg: 'Volvió al estado de apertura. <code>Ctrl+Z</code> para deshacer.', id: 'reset' });
        });
    }

    var observer = new MutationObserver(function (records) {
        if (suppress) return;
        for (var i = 0; i < records.length; i++) {
            var t = records[i].target;
            if (t.nodeType === 3) t = t.parentElement;
            if (t && t.closest && t.closest(SEL)) { scheduleCommit(); return; }
        }
    });

    function changed() {
        renderHistory();
        st.dirty = true;
        if (st.mode === 'server' && !st.conflict) scheduleSave();
        renderStatus();
    }

    /* ------------------------------------------------------------------ */
    /* Guardado                                                            */
    /* ------------------------------------------------------------------ */
    var saveTimer = null;
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { save(false); }, SAVE_DELAY); }

    /* Parsea el HTML del disco sin ejecutar scripts. Si la página marca sus textos como
       editables al cargar (window.pdMarkEditables, p. ej. el generador de adopción), se
       aplica la misma marca acá para que la lista de editables coincida con la de la
       página. Al guardar, esa marca queda escrita en el archivo (estática). */
    function parseSource(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (typeof window.pdMarkEditables === 'function') window.pdMarkEditables(doc);
        return doc;
    }

    function buildHtml() {
        var doc = parseSource(st.baseHtml);
        var base = topLevel(doc);
        if (base.length !== editables.length) {
            throw new Error('La estructura del archivo en disco no coincide con la página abierta. Recargá la página.');
        }
        editables.forEach(function (n, i) {
            base[i].innerHTML = n.innerHTML;
            setAttr(base[i], 'style', n.getAttribute('style'));
            setAttr(base[i], 'class', n.getAttribute('class'));
        });
        // Se conserva el texto original de todo lo que está fuera de <body> (head intacto).
        var src = st.baseHtml, m = src.match(/<body\b[^>]*>/i), end = src.toLowerCase().lastIndexOf('</body>');
        if (!m || end < 0) return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        var start = m.index + m[0].length;
        var body = doc.body.innerHTML
            // atributos booleanos como estaban escritos (checked, no checked="")
            .replace(/(<[a-z][^<>]*?\s(?:checked|selected|disabled|readonly|multiple|hidden|defer|async|autofocus|open))=""/gi, '$1')
            .replace(/(<[a-z][^<>]*?\s(?:checked|selected|disabled|readonly|multiple|hidden|defer|async|autofocus|open))=""/gi, '$1')
            // elementos vacíos de SVG como estaban escritos (<path .../>, no <path ...></path>)
            .replace(/<(path|rect|circle|ellipse|line|polyline|polygon|stop|use|image)\b([^<>]*?)><\/\1>/gi, '<$1$2/>')
            // espacio duro como carácter (el serializador lo escribe &nbsp;)
            .replace(/&nbsp;/g, '\u00a0')
            // el parser mete en <body> los saltos de línea que había después de </body>
            .replace(/\s*$/, src.slice(start, end).match(/\s*$/)[0]);
        return src.slice(0, start) + body + src.slice(end);
    }

    function post(path, body) {
        return fetch(API + path, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', 'X-PD-Editor': '1' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.__status = r.status; return d; }); });
    }

    function save(force) {
        if (st.mode !== 'server') return Promise.resolve(false);
        clearTimeout(saveTimer);
        if (st.saving) { st.queued = true; return Promise.resolve(false); }
        flush();
        var html;
        try { html = buildHtml(); }
        catch (e) { st.error = e.message; renderStatus(); toast({ type: 'error', title: 'No se pudo guardar', msg: esc(e.message), duration: 0, id: 'save' }); return Promise.resolve(false); }

        st.saving = true; st.dirty = false; st.saveSeq++; renderStatus();
        return post('save', { path: docPath, html: html, baseHash: st.baseHash, force: !!force }).then(function (d) {
            if (d.__status === 409) { st.dirty = true; onConflict(); return false; }
            if (d.__status !== 200 || !d.ok) throw new Error(d.error || ('Error ' + d.__status));
            st.baseHtml = html; st.baseHash = d.hash; st.lastSaved = new Date();
            st.error = null; st.conflict = false;
            if (st.disconnected) { st.disconnected = false; toast({ type: 'success', title: 'Reconectado', msg: 'Los cambios pendientes ya se guardaron.', id: 'conn' }); }
            if (d.buildError) toast({ type: 'warn', title: 'Guardado, pero no se pudo compilar', msg: esc(d.buildError), duration: 8000, id: 'build' });
            return true;
        }).catch(function (e) {
            st.dirty = true;
            var offline = e instanceof TypeError;   // fetch falló: el servidor no responde
            st.error = offline ? 'El editor está cerrado' : e.message;
            if (offline) markDisconnected();
            else toast({ type: 'error', title: 'No se pudo guardar', msg: esc(e.message), duration: 0, id: 'save', action: { label: 'Reintentar', run: function () { save(false); } } });
            return false;
        }).then(function (ok) {
            st.saving = false; renderStatus();
            if (st.queued) { st.queued = false; save(false); }
            return ok;
        });
    }

    function markDisconnected() {
        if (st.disconnected) return;
        st.disconnected = true; renderStatus();
        toast({
            type: 'error', title: 'Se cerró el editor', duration: 0, id: 'conn',
            msg: 'La ventana de <strong>abrir-editor.cmd</strong> ya no está abierta, así que los cambios nuevos <strong>no se guardan</strong>. Volvé a abrirla para seguir guardando.'
        });
    }

    function onConflict() {
        if (st.conflict) return;
        st.conflict = true; renderStatus();
        modal({
            type: 'warn', icon: 'fa-code-compare',
            title: 'El archivo cambió en el disco',
            html: '<p>Mientras editabas, alguien más modificó <code>' + esc(fileName) + '</code> (por ejemplo, Claude).</p>' +
                  '<p><strong>Recargar</strong> trae la versión del disco y descarta tus cambios sin guardar. <strong>Guardar los míos</strong> la reemplaza con lo que ves en pantalla.</p>',
            actions: [
                { label: 'Guardar los míos', variant: 'secondary', value: 'mine' },
                { label: 'Recargar', variant: 'primary', icon: 'fa-rotate', value: 'reload' }
            ]
        }).then(function (v) {
            if (v === 'reload') { st.dirty = false; reloadKeepingView('Se cargó la versión del disco.'); }
            else if (v === 'mine') { st.conflict = false; save(true); }
            // null (Esc): queda en conflicto; el estado lo indica y se puede resolver desde ahí
        });
    }

    function reloadKeepingView(msg) {
        var zoom = document.getElementById('zoomSelector');
        // prev: cómo estaba cada texto, para mostrar después qué cambió
        session('pd-editor-restore', { y: window.scrollY, zoom: zoom ? zoom.value : null, msg: msg,
                                       prev: editables.map(function (n) { return n.innerHTML; }) });
        location.reload();
    }

    /* Qué editables cambiaron respecto de `prev`. Si la cantidad es la misma se compara
       posición por posición; si no (se agregaron/quitaron bloques), por contenido. */
    function changedSince(prev) {
        if (!prev) return [];
        if (prev.length === editables.length) {
            return editables.filter(function (n, i) { return n.innerHTML !== prev[i]; });
        }
        var before = {};
        prev.forEach(function (h) { before[h] = true; });
        return editables.filter(function (n) { return !before[n.innerHTML]; });
    }

    /* Lleva la vista al elemento y lo remarca. El resalte es una capa aparte (no toca
       el elemento), así que no entra en el historial ni se guarda en el archivo. */
    function spotlight(target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var old = document.querySelector('.pde-highlight'); if (old) old.remove();
        var r = target.getBoundingClientRect();
        var hl = el('div', 'pde-highlight no-print', '<span class="pde-highlight-tag"><i class="fa-solid fa-pen-to-square"></i> Cambió</span>');
        hl.style.left = (r.left + window.scrollX - 6) + 'px';
        hl.style.top = (r.top + window.scrollY - 4) + 'px';
        hl.style.width = (r.width + 12) + 'px';
        hl.style.height = (r.height + 8) + 'px';
        document.body.appendChild(hl);
        setTimeout(function () { hl.remove(); }, 3200);
    }

    function announceExternalChange(restore) {
        var changes = changedSince(restore.prev);
        var n = changes.length;
        if (!n) {
            toast({ type: 'info', icon: 'fa-rotate', title: 'Documento actualizado', msg: esc(restore.msg), duration: 3500 });
            return;
        }
        var i = 0;
        var label = function () { return n === 1 ? 'Ver el cambio' : 'Ver cambio ' + (i + 1) + ' de ' + n; };
        toast({
            type: 'info', icon: 'fa-rotate', title: 'Documento actualizado', duration: 12000,
            msg: esc(restore.msg) + ' ' + (n === 1 ? 'Cambió <strong>1 texto</strong>.' : 'Cambiaron <strong>' + n + ' textos</strong>.'),
            action: {
                label: label(), keepOpen: n > 1,
                run: function (btn) {
                    spotlight(changes[i]);
                    i = (i + 1) % n;
                    if (btn) btn.innerHTML = esc(label()) + ' <i class="fa-solid fa-arrow-right"></i>';
                }
            }
        });
    }

    var polling = false;
    function poll() {
        if (polling || st.mode !== 'server' || document.hidden || st.saving || st.conflict) return;
        var seq = st.saveSeq;
        var ctrl = window.AbortController ? new AbortController() : null;
        var timeout = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
        polling = true;
        fetch(API + 'status?path=' + encodeURIComponent(docPath), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (st.disconnected) {
                    st.disconnected = false; renderStatus();
                    toast({ type: 'success', title: 'Reconectado', msg: st.dirty ? 'Guardando los cambios pendientes…' : 'El guardado automático sigue activo.', id: 'conn' });
                    if (st.dirty) save(false);
                    return;
                }
                if (seq !== st.saveSeq || st.saving || !d.hash || d.hash === st.baseHash) return;
                flush();
                if (!st.dirty) reloadKeepingView('Se actualizó con los cambios del disco.');
                else onConflict();
            })
            .catch(function () { markDisconnected(); })
            .then(function () { clearTimeout(timeout); polling = false; });
    }

    /* ------------------------------------------------------------------ */
    /* Interfaz: estado + botones                                          */
    /* ------------------------------------------------------------------ */
    var statusEl = null, btnUndo = null, btnRedo = null, btnReset = null;

    function renderStatus() {
        if (!statusEl) return;
        var cls = 'is-neutral', html = '', title = '', click = null;
        if (st.mode === 'init') { cls = 'is-busy'; html = '<i class="fa-solid fa-circle-notch pde-spin"></i> Conectando'; }
        else if (st.mode === 'compiled') { cls = 'is-neutral'; html = '<i class="fa-solid fa-lock"></i> Copia compilada'; title = 'Esta copia no guarda cambios. Clic para más info.'; click = explainCompiled; }
        else if (st.mode === 'offline') { cls = 'is-warn'; html = '<i class="fa-solid fa-triangle-exclamation"></i> Sin guardado'; title = 'Los cambios no se guardan en disco. Clic para más info.'; click = explainOffline; }
        else if (st.conflict) { cls = 'is-error'; html = '<i class="fa-solid fa-code-compare"></i> Conflicto'; title = 'El archivo cambió en disco. Clic para resolver.'; click = function () { st.conflict = false; onConflict(); }; }
        else if (st.disconnected) { cls = 'is-error'; html = '<i class="fa-solid fa-plug-circle-xmark"></i> Editor cerrado'; title = 'Volvé a abrir abrir-editor.cmd para seguir guardando.'; click = explainOffline; }
        else if (st.saving) { cls = 'is-busy'; html = '<i class="fa-solid fa-circle-notch pde-spin"></i> Guardando'; }
        else if (st.error) { cls = 'is-error'; html = '<i class="fa-solid fa-circle-xmark"></i> Error al guardar'; title = st.error + ' · Clic para reintentar.'; click = function () { save(false); }; }
        else if (st.dirty) { cls = 'is-pending'; html = '<span class="pde-dot"></span> Sin guardar'; title = 'Se guarda en un instante (Ctrl+S para guardar ya).'; }
        else { cls = 'is-ok'; html = '<span class="pde-dot"></span> Guardado'; title = 'Guardado automático activo' + (st.lastSaved ? ' · último guardado ' + hhmm(st.lastSaved) : '') + ' · ' + fileName; }
        statusEl.className = 'pde-status ' + cls;
        statusEl.innerHTML = html; statusEl.title = title;
        statusEl.setAttribute('data-clickable', click ? '1' : '0');
        statusEl.onclick = click;
    }

    function renderHistory() {
        if (!btnUndo) return;
        btnUndo.disabled = idx <= 0;
        btnRedo.disabled = idx >= hist.length - 1;
    }

    function mountUi() {
        statusEl = document.getElementById('pdEditorStatus');
        var slot = document.getElementById('pdEditorHistory');
        var dock = null;
        if (!statusEl || !slot) {   // documento sin huecos en la barra: barra flotante
            dock = el('div', 'pde-dock no-print');
            document.body.appendChild(dock);
        }
        if (!statusEl) { statusEl = el('span'); dock.appendChild(statusEl); }
        statusEl.classList.add('pde-status');
        if (!slot) { slot = el('div'); dock.appendChild(slot); }
        slot.classList.add('pde-history');
        slot.innerHTML =
            '<span class="pde-history-label"><i class="fa-solid fa-clock-rotate-left"></i> Historial</span>' +
            '<button type="button" class="pde-btn pde-icon-only" data-act="undo" title="Deshacer (Ctrl+Z)"><i class="fa-solid fa-rotate-left"></i></button>' +
            '<button type="button" class="pde-btn pde-icon-only" data-act="redo" title="Rehacer (Ctrl+Y)"><i class="fa-solid fa-rotate-right"></i></button>' +
            '<button type="button" class="pde-btn" data-act="reset" title="Volver al estado en que abriste el documento"><i class="fa-solid fa-clock-rotate-left"></i><span>Restablecer</span></button>';
        btnUndo = slot.querySelector('[data-act="undo"]');
        btnRedo = slot.querySelector('[data-act="redo"]');
        btnReset = slot.querySelector('[data-act="reset"]');
        // mousedown sin foco: no se pierde la selección ni el cursor del texto
        [btnUndo, btnRedo, btnReset].forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); });
        btnUndo.onclick = undo; btnRedo.onclick = redo; btnReset.onclick = resetAll;
        renderHistory(); renderStatus();
    }

    function explainOffline() {
        modal({
            type: 'warn', icon: 'fa-floppy-disk',
            title: st.disconnected ? 'El editor está cerrado' : 'Los cambios no se guardan',
            html: (st.disconnected
                ? '<p>Se cerró la ventana de <strong>abrir-editor.cmd</strong>, que es la que escribe los cambios en el disco.</p>'
                : '<p>Abriste el archivo directamente (doble clic), sin el editor. Podés editar y descargar el PDF, pero <strong>al cerrar la pestaña se pierde todo</strong>.</p>') +
                '<p>Para que se guarde solo: abrí <code>abrir-editor.cmd</code> con doble clic, en la misma carpeta que este documento.</p>'
        });
    }
    function explainCompiled() {
        modal({
            type: 'info', icon: 'fa-lock',
            title: 'Esta es la copia compilada',
            html: '<p>Es la versión autocontenida del documento: sirve para exportar o compartir. <strong>Lo que edites acá no se guarda.</strong></p>' +
                  '<p>Para editar con guardado automático, abrí <code>abrir-editor.cmd</code> en la carpeta del documento. Esta copia se actualiza sola cada vez que se guarda.</p>'
        });
    }

    /* ------------------------------------------------------------------ */
    /* Teclado, pegado y cierre                                            */
    /* ------------------------------------------------------------------ */
    document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        var k = (e.key || '').toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        else if (k === 's') {
            e.preventDefault();
            if (st.mode === 'server') save(false).then(function (ok) { if (ok) toast({ type: 'success', title: 'Guardado', msg: 'Cambios escritos en <code>' + esc(fileName) + '</code>.', duration: 2500, id: 'save' }); });
            else if (st.mode === 'compiled') explainCompiled();
            else explainOffline();
        }
    }, true);
    // Deshacer desde el menú contextual / Edición del navegador
    document.addEventListener('beforeinput', function (e) {
        if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); }
        else if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); }
    }, true);
    // Pegar siempre como texto plano: evita arrastrar estilos de Word/web al documento
    document.addEventListener('paste', function (e) {
        var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!t || !e.clipboardData) return;
        e.preventDefault();
        var text = e.clipboardData.getData('text/plain');
        if (!document.execCommand('insertText', false, text)) {
            var sel = window.getSelection(); if (!sel.rangeCount) return;
            sel.deleteFromDocument(); sel.getRangeAt(0).insertNode(document.createTextNode(text)); sel.collapseToEnd();
        }
    });
    window.addEventListener('beforeunload', function (e) {
        flush();
        var risky = st.mode === 'server' ? (st.dirty || st.saving) : (idx > 0 && !same(hist[idx], hist[0]));
        if (risky) { e.preventDefault(); e.returnValue = ''; }
    });

    /* ------------------------------------------------------------------ */
    /* Arranque                                                            */
    /* ------------------------------------------------------------------ */
    function detectMode() {
        if (isCompiled) return Promise.resolve({ mode: 'compiled' });
        if (location.protocol !== 'http:' && location.protocol !== 'https:') return Promise.resolve({ mode: 'offline' });
        return fetch(API + 'source?path=' + encodeURIComponent(docPath), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (d && d.editable && typeof d.html === 'string') return { mode: 'server', html: d.html, hash: d.hash };
                return { mode: 'offline', reason: d && d.reason };
            })
            .catch(function () { return { mode: 'offline' }; });
    }

    function init() {
        editables = topLevel(document);
        hist = [snap()]; idx = 0;
        mountUi();
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });

        var restore = session('pd-editor-restore');
        if (restore) {
            if (restore.zoom && typeof window.changeZoom === 'function') {
                var z = document.getElementById('zoomSelector'); if (z) z.value = restore.zoom;
                window.changeZoom(restore.zoom);
            }
            requestAnimationFrame(function () { window.scrollTo(0, restore.y || 0); });
        }

        detectMode().then(function (r) {
            st.mode = r.mode;
            if (r.mode === 'server') {
                st.baseHtml = r.html; st.baseHash = r.hash;
                if (topLevel(parseSource(r.html)).length !== editables.length) {
                    // El archivo cambió entre la carga y ahora: traer la versión nueva
                    return reloadKeepingView('Se actualizó con los cambios del disco.');
                }
                st.dirty = !same(snap(), hist[0]);   // si se editó durante la conexión
                if (st.dirty) scheduleSave();
                setInterval(poll, POLL_MS);
                if (restore && restore.msg) announceExternalChange(restore);
                else toast({ type: 'success', icon: 'fa-floppy-disk', title: 'Guardado automático activo', msg: 'Cada cambio se guarda solo en <code>' + esc(fileName) + '</code>.', duration: 3500, id: 'mode' });
            } else if (r.mode === 'offline') {
                toast({
                    type: 'warn', title: 'Estás editando sin guardado', duration: 9000, id: 'mode',
                    msg: 'Los cambios se pierden al cerrar la pestaña. Para que se guarden solos, abrí el documento con <strong>abrir-editor.cmd</strong>.',
                    action: { label: 'Cómo hacerlo', run: explainOffline }
                });
            }
            renderStatus();
        });
    }

    window.__pdEditor = { undo: undo, redo: redo, reset: resetAll, save: function () { return save(false); }, toast: toast, modal: modal, state: st };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
