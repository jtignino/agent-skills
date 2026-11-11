/* ==========================================================================
   Piensa Brand Docs — editor
   - Historial: deshacer / rehacer / restablecer (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z).
   - Guardado automático en disco cuando el documento se abre con abrir-editor.cmd
     (servidor local _editor/serve.js). Abierto con doble clic (file://) o en la
     copia compilada, edita igual pero avisa que no guarda.
   - Si el archivo cambia en disco (p. ej. lo edita Claude) y no hay cambios
     locales, la página se recarga sola conservando la posición.
   - Interfaz: íconos (lucide, dibujados acá como SVG), estado de guardado,
     avisos, modales y, si la página trae la barra .pde-bar, sus paneles
     desplegables, el zoom −/+ y la cuenta de imágenes a descargar.

   Qué se guarda: sólo el contenido, el estilo y la clase de los elementos
   [contenteditable="true"]. Se toma el HTML original del disco y se le
   reemplazan esos elementos, así nada de lo que los scripts agregan en tiempo
   de ejecución (estilos de Tailwind, zoom, guías, íconos) termina en el archivo.
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
    /* Íconos: lucide 1.70.0 (lucide.dev, licencia ISC), trazo 2           */
    /* ------------------------------------------------------------------ */
    var LUCIDE = {
        'check': '<path d="M20 6 9 17l-5-5"/>',
        'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
        'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        'warn': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
        'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
        'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        'git-compare': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>',
        'unplug': '<path d="m19 5 3-3"/><path d="m2 22 3-3"/><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>',
        'save': '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
        'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
        'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        'undo-2': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
        'redo-2': '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
        'rotate-ccw-clock': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
        'square-pen': '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
        'palette': '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
        'eraser': '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/>',
        'images': '<path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/><path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><circle cx="13" cy="7" r="1" fill="currentColor"/><rect x="8" y="2" width="14" height="14" rx="2"/>',
        'file-down': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
        'minus': '<path d="M5 12h14"/>',
        'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
        'square-dashed': '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
        'chevron-down': '<path d="m6 9 6 6 6-6"/>',
        'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
        'pipette': '<path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"/><path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"/><path d="m2 22 .414-.414"/>'
    };
    function icon(name, cls) {
        var body = LUCIDE[name];
        if (!body) return '';
        return '<svg class="pde-i' + (cls ? ' ' + cls : '') + '" data-pde-icon="' + name + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
    }
    /* <i data-pde-icon="nombre" class="..."></i> → SVG (sólo en la interfaz, nunca en textos editables) */
    function hydrateIcons(root) {
        Array.prototype.forEach.call((root || document).querySelectorAll('i[data-pde-icon]'), function (i) {
            if (i.closest(SEL)) return;
            var w = document.createElement('span');
            w.innerHTML = icon(i.getAttribute('data-pde-icon'), i.getAttribute('class'));
            if (w.firstChild) i.replaceWith(w.firstChild);
        });
    }

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
    function hhmm(d) { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
    function hm(d) { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
    function setAttr(node, name, val) { if (val == null) node.removeAttribute(name); else node.setAttribute(name, val); }
    function styleOf(n) { return n.getAttribute('style') || null; }   // style="" cuenta como sin estilo
    function session(key, val) {
        try {
            if (val === undefined) { var v = sessionStorage.getItem(key); sessionStorage.removeItem(key); return v ? JSON.parse(v) : null; }
            sessionStorage.setItem(key, JSON.stringify(val));
        } catch (e) { return null; }
    }
    var uidN = 0;
    function uid(p) { return 'pde-' + p + '-' + (++uidN); }

    /* ------------------------------------------------------------------ */
    /* Avisos (toasts)                                                     */
    /* ------------------------------------------------------------------ */
    var ICONS = { success: 'circle-check', info: 'info', warn: 'warn', error: 'circle-x' };
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
            '<span class="pde-toast-icon">' + icon(o.icon || ICONS[type]) + '</span>' +
            '<div><div class="pde-toast-title">' + esc(o.title) + '</div>' +
            (o.msg ? '<div class="pde-toast-msg">' + o.msg + '</div>' : '') + '</div>' +
            '<button type="button" class="pde-toast-close" aria-label="Cerrar aviso" title="Cerrar">' + icon('x') + '</button>';
        if (o.action) {
            var a = el('button', 'pde-toast-action', esc(o.action.label) + icon('arrow-right'));
            a.type = 'button';
            a.onclick = function () { if (!o.action.keepOpen) close(); o.action.run(a); };
            t.children[1].appendChild(a);
        }
        var timer = null, remaining = duration, started = 0;
        function close() {
            if (!t.isConnected || t.classList.contains('is-leaving')) return;
            clearTimeout(timer); t.classList.add('is-leaving');
            setTimeout(function () { t.remove(); }, 230);
        }
        function run() { started = Date.now(); timer = setTimeout(close, remaining); }
        if (duration > 0) {
            var bar = el('div', 'pde-toast-bar'); bar.style.animationDuration = duration + 'ms'; t.appendChild(bar);
            t.addEventListener('mouseenter', function () { clearTimeout(timer); remaining -= Date.now() - started; });
            t.addEventListener('mouseleave', run);
            t.addEventListener('focusin', function () { clearTimeout(timer); });
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
            var tid = uid('title'), bid = uid('body');
            box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', tid); box.setAttribute('aria-describedby', bid);
            box.innerHTML =
                '<div class="pde-modal-head"><div class="pde-modal-icon">' + icon(o.icon || ICONS[type]) + '</div>' +
                '<h2 class="pde-modal-title" id="' + tid + '">' + esc(o.title) + '</h2></div>' +
                '<div class="pde-modal-body" id="' + bid + '">' + o.html + '</div>';
            var actions = el('div', 'pde-modal-actions');
            var buttons = (o.actions || [{ label: 'Entendido', variant: 'primary', value: true }]).map(function (a) {
                var b = el('button', 'pde-mbtn pde-mbtn-' + (a.variant || 'secondary'), (a.icon ? icon(a.icon) : '') + esc(a.label));
                b.type = 'button';
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

    function snap() { return editables.map(function (n) { return [n.innerHTML, styleOf(n), n.getAttribute('class')]; }); }
    function same(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1] || a[i][2] !== b[i][2]) return false;
        return true;
    }
    function apply(s) {
        suppress = true;
        editables.forEach(function (n, i) {
            if (n.innerHTML !== s[i][0]) n.innerHTML = s[i][0];
            if (styleOf(n) !== s[i][1]) setAttr(n, 'style', s[i][1]);
            setAttr(n, 'class', s[i][2]);
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
            type: 'warn', icon: 'rotate-ccw-clock',
            title: '¿Restablecer el documento?',
            html: '<p>Vuelve todos los textos y colores a como estaban <strong>cuando abriste el documento</strong>.</p>' +
                  '<p>Si te arrepentís, lo podés deshacer con <code>Ctrl+Z</code>.</p>',
            actions: [
                { label: 'Cancelar', variant: 'secondary', value: false },
                { label: 'Restablecer', variant: 'danger', icon: 'rotate-ccw-clock', value: true }
            ]
        }).then(function (ok) {
            if (!ok) return;
            apply(hist[0]); commit();
            toast({ type: 'success', icon: 'rotate-ccw-clock', title: 'Documento restablecido', msg: 'Volvió al estado de apertura. <code>Ctrl+Z</code> para deshacer.', id: 'reset' });
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
            setAttr(base[i], 'style', styleOf(n));
            setAttr(base[i], 'class', n.getAttribute('class'));
        });
        // Se conserva el texto original de todo lo que está fuera de <body> (head intacto).
        var src = st.baseHtml, m = src.match(/<body\b[^>]*>/i), end = src.toLowerCase().lastIndexOf('</body>');
        if (!m || end < 0) return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        var start = m.index + m[0].length;
        var body = doc.body.innerHTML
            // atributos booleanos como estaban escritos (checked, no checked="")
            .replace(/(<[a-z][^<>]*?\s(?:checked|selected|disabled|readonly|multiple|hidden|defer|async|autofocus|open|popover))=""/gi, '$1')
            .replace(/(<[a-z][^<>]*?\s(?:checked|selected|disabled|readonly|multiple|hidden|defer|async|autofocus|open|popover))=""/gi, '$1')
            // elementos vacíos de SVG como estaban escritos (<path .../>, no <path ...></path>)
            .replace(/<(path|rect|circle|ellipse|line|polyline|polygon|stop|use|image)\b([^<>]*?)><\/\1>/gi, '<$1$2/>')
            // espacio duro como carácter (el serializador lo escribe &nbsp;)
            .replace(/&nbsp;/g, ' ')
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
            type: 'error', icon: 'unplug', title: 'Se cerró el editor', duration: 0, id: 'conn',
            msg: 'La ventana de <strong>abrir-editor.cmd</strong> ya no está abierta, así que los cambios nuevos <strong>no se guardan</strong>. Volvé a abrirla para seguir guardando.'
        });
    }

    function onConflict() {
        if (st.conflict) return;
        st.conflict = true; renderStatus();
        modal({
            type: 'warn', icon: 'git-compare',
            title: 'El archivo cambió en el disco',
            html: '<p>Mientras editabas, alguien más modificó <code>' + esc(fileName) + '</code> (por ejemplo, Claude).</p>' +
                  '<p><strong>Recargar</strong> trae la versión del disco y descarta tus cambios sin guardar. <strong>Guardar los míos</strong> la reemplaza con lo que ves en pantalla.</p>',
            actions: [
                { label: 'Guardar los míos', variant: 'secondary', value: 'mine' },
                { label: 'Recargar', variant: 'primary', icon: 'refresh-cw', value: 'reload' }
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
        var hl = el('div', 'pde-highlight no-print', '<span class="pde-highlight-tag">' + icon('square-pen') + 'Cambió</span>');
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
            toast({ type: 'info', icon: 'refresh-cw', title: 'Documento actualizado', msg: esc(restore.msg), duration: 3500 });
            return;
        }
        var i = 0;
        var label = function () { return n === 1 ? 'Ver el cambio' : 'Ver cambio ' + (i + 1) + ' de ' + n; };
        toast({
            type: 'info', icon: 'refresh-cw', title: 'Documento actualizado', duration: 12000,
            msg: esc(restore.msg) + ' ' + (n === 1 ? 'Cambió <strong>1 texto</strong>.' : 'Cambiaron <strong>' + n + ' textos</strong>.'),
            action: {
                label: label(), keepOpen: n > 1,
                run: function (btn) {
                    spotlight(changes[i]);
                    i = (i + 1) % n;
                    if (btn) btn.innerHTML = esc(label()) + icon('arrow-right');
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
    /* Interfaz: estado + historial                                        */
    /* ------------------------------------------------------------------ */
    var statusEl = null, btnUndo = null, btnRedo = null, btnReset = null, statusClick = null;

    function renderStatus() {
        if (!statusEl) return;
        var cls, ic, text, title = '', click = null, spin = false, extra = '';
        if (st.mode === 'init') { cls = 'is-busy'; ic = 'loader-circle'; spin = true; text = 'Conectando…'; }
        else if (st.mode === 'compiled') { cls = 'is-neutral'; ic = 'lock'; text = 'Copia compilada'; title = 'Esta copia no guarda los cambios. Clic para más información.'; click = explainCompiled; }
        else if (st.mode === 'offline') { cls = 'is-warn'; ic = 'warn'; text = 'No se guarda'; title = 'Los cambios no se guardan en el disco. Clic para ver cómo abrirlo con guardado.'; click = explainOffline; }
        else if (st.conflict) { cls = 'is-error'; ic = 'git-compare'; text = 'Conflicto'; title = 'El archivo cambió en el disco mientras editabas. Clic para resolver.'; click = function () { st.conflict = false; onConflict(); }; }
        else if (st.disconnected) { cls = 'is-error'; ic = 'unplug'; text = 'Editor cerrado'; title = 'Volvé a abrir abrir-editor.cmd para seguir guardando. Clic para más información.'; click = explainOffline; }
        else if (st.saving) { cls = 'is-busy'; ic = 'loader-circle'; spin = true; text = 'Guardando…'; }
        else if (st.error) { cls = 'is-error'; ic = 'circle-x'; text = 'Error al guardar'; title = st.error + '. Clic para reintentar.'; click = function () { save(false); }; }
        else if (st.dirty) { cls = 'is-busy'; ic = 'loader-circle'; spin = true; text = 'Guardando…'; title = 'Se guarda solo en un instante (Ctrl+S para guardar ya).'; }
        else {
            cls = 'is-ok'; ic = 'circle-check'; text = 'Guardado';
            if (st.lastSaved) extra = ' <span class="pde-status-time">' + hm(st.lastSaved) + '</span>';
            title = 'Guardado automático activo en ' + fileName + (st.lastSaved ? '. Último guardado: ' + hhmm(st.lastSaved) : '') + '.';
        }
        statusEl.className = 'pde-status ' + cls;
        statusEl.innerHTML = icon(ic, spin ? 'pde-spin' : '') + '<span>' + text + '</span>' + extra;
        statusEl.title = title;
        statusClick = click;
        if (click) { statusEl.setAttribute('role', 'button'); statusEl.setAttribute('tabindex', '0'); }
        else { statusEl.removeAttribute('role'); statusEl.removeAttribute('tabindex'); }
        statusEl.setAttribute('data-clickable', click ? '1' : '0');
    }

    function renderHistory() {
        if (!btnUndo) return;
        btnUndo.disabled = idx <= 0;
        btnRedo.disabled = idx >= hist.length - 1;
        btnReset.disabled = same(hist[idx], hist[0]);
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
        statusEl.addEventListener('click', function () { if (statusClick) statusClick(); });
        statusEl.addEventListener('keydown', function (e) {
            if (statusClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); statusClick(); }
        });
        if (!slot) { slot = el('div'); dock.appendChild(slot); }
        slot.classList.add('pde-history');
        if (!slot.getAttribute('role')) { slot.setAttribute('role', 'group'); slot.setAttribute('aria-label', 'Historial'); }
        slot.innerHTML =
            '<button type="button" class="pde-btn pde-icon-only" data-act="undo" aria-label="Deshacer" title="Deshacer (Ctrl+Z)">' + icon('undo-2') + '</button>' +
            '<button type="button" class="pde-btn pde-icon-only" data-act="redo" aria-label="Rehacer" title="Rehacer (Ctrl+Y)">' + icon('redo-2') + '</button>' +
            '<button type="button" class="pde-btn" data-act="reset" aria-label="Restablecer" title="Volver a como estaba el documento al abrirlo">' + icon('rotate-ccw-clock') + '<span class="pde-label">Restablecer</span></button>';
        btnUndo = slot.querySelector('[data-act="undo"]');
        btnRedo = slot.querySelector('[data-act="redo"]');
        btnReset = slot.querySelector('[data-act="reset"]');
        // mousedown sin foco: no se pierde la selección ni el cursor del texto
        [btnUndo, btnRedo, btnReset].forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); });
        btnUndo.onclick = undo; btnRedo.onclick = redo; btnReset.onclick = resetAll;
        renderHistory(); renderStatus();
    }

    /* ------------------------------------------------------------------ */
    /* Barra (.pde-bar): paneles, zoom −/+, imágenes                       */
    /* ------------------------------------------------------------------ */
    var syncZoom = function () {};

    function mountBar() {
        hydrateIcons(document);
        var title = document.querySelector('[data-pde-role="doc-title"]');
        if (title && document.title) { title.textContent = document.title; title.title = document.title; }
        var bar = document.querySelector('.pde-bar');
        if (!bar) return;

        // La barra es fija: el documento arranca debajo de ella, mida lo que mida
        var setH = function () { document.documentElement.style.setProperty('--pde-bar-h', bar.offsetHeight + 'px'); };
        setH();
        if (window.ResizeObserver) new ResizeObserver(setH).observe(bar); else window.addEventListener('resize', setH);

        wirePopovers();
        wireZoom(bar);
        wirePages();
    }

    function wirePopovers() {
        var native = typeof HTMLElement !== 'undefined' && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
        if (!native) document.documentElement.classList.add('pde-no-popover');
        var open = [];
        function place(pop, btn) {
            var r = btn.getBoundingClientRect();
            var w = parseFloat(getComputedStyle(pop).width) || 272;
            var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
            pop.style.left = left + 'px';
            pop.style.top = (r.bottom + 8) + 'px';
        }
        function setOpen(pop, btn, on) {
            pop.classList.toggle('is-open', on);
            btn.setAttribute('aria-expanded', on ? 'true' : 'false');
            if (on) { place(pop, btn); open.push(pop); }
            else open = open.filter(function (p) { return p !== pop; });
        }
        function hide(pop) { if (native) { try { pop.hidePopover(); } catch (e) {} } else pop.dispatchEvent(new Event('pde-close')); }

        Array.prototype.forEach.call(document.querySelectorAll('[popovertarget]'), function (btn) {
            var pop = document.getElementById(btn.getAttribute('popovertarget'));
            if (!pop) return;
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('aria-controls', pop.id);
            if (native) {
                pop.addEventListener('beforetoggle', function (e) { setOpen(pop, btn, e.newState === 'open'); });
                return;
            }
            // Sin Popover API: abrir/cerrar a mano, con Esc y clic afuera
            function close() { setOpen(pop, btn, false); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); }
            function outside(e) { if (!pop.contains(e.target) && !btn.contains(e.target)) close(); }
            function key(e) { if (e.key === 'Escape') { close(); btn.focus(); } }
            pop.addEventListener('pde-close', close);
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                if (pop.classList.contains('is-open')) return close();
                setOpen(pop, btn, true);
                document.addEventListener('mousedown', outside, true);
                document.addEventListener('keydown', key, true);
            });
        });
        window.addEventListener('resize', function () { open.slice().forEach(hide); });
    }

    function wireZoom(bar) {
        var sel = document.getElementById('zoomSelector');
        var steps = bar.querySelectorAll('[data-pde-zoom-step]');
        if (!sel || !steps.length) return;
        syncZoom = function () {
            Array.prototype.forEach.call(steps, function (b) {
                var i = sel.selectedIndex + parseInt(b.getAttribute('data-pde-zoom-step'), 10);
                b.disabled = i < 0 || i >= sel.options.length;
            });
        };
        Array.prototype.forEach.call(steps, function (b) {
            b.addEventListener('click', function () {
                var i = sel.selectedIndex + parseInt(b.getAttribute('data-pde-zoom-step'), 10);
                if (i < 0 || i >= sel.options.length) return;
                sel.selectedIndex = i;
                if (typeof window.changeZoom === 'function') window.changeZoom(sel.value);
                syncZoom();
            });
        });
        sel.addEventListener('change', syncZoom);
        syncZoom();
    }

    /* «Solo las páginas marcadas» + los «Pág. N» de cada hoja: cuántas imágenes se bajan.
       Desmarcar una hoja activa «Solo las páginas marcadas» (si no, la casilla no haría nada). */
    function wirePages() {
        var only = document.getElementById('onlySelected');
        if (!only) return;
        var boxes = Array.prototype.slice.call(document.querySelectorAll('.page-select input[type="checkbox"]'));
        var countEl = document.querySelector('[data-pde-role="img-count"]');
        var btn = document.getElementById('btnImages');
        document.body.classList.add('pde-pages-ready');
        function update() {
            var total = boxes.length || document.querySelectorAll('.page-container').length;
            var marked = boxes.filter(function (b) { return b.checked; }).length;
            var n = only.checked ? marked : total;
            document.body.classList.toggle('pde-only-selected', only.checked);
            if (countEl) {
                countEl.innerHTML = n === 0
                    ? 'No hay páginas marcadas. Marcá al menos una en su casilla «Pág.».'
                    : only.checked
                        ? 'Se ' + (n === 1 ? 'descarga' : 'descargan') + ' <strong>' + n + ' de ' + total + '</strong> páginas: las marcadas en su casilla «Pág.».'
                        : 'Se descargan las <strong>' + total + ' páginas</strong>, una imagen por página.';
            }
            if (btn && !document.body.classList.contains('exporting')) btn.disabled = n === 0;
        }
        boxes.forEach(function (b) {
            b.addEventListener('change', function () {
                if (!b.checked && !only.checked) {
                    only.checked = true;
                    toast({ type: 'info', icon: 'images', title: 'Solo las páginas marcadas', id: 'pages', duration: 4000,
                            msg: 'Al descargar imágenes se bajan solo las páginas con su casilla «Pág.» marcada.' });
                }
                update();
            });
        });
        only.addEventListener('change', update);
        update();
    }

    function explainOffline() {
        modal({
            type: 'warn', icon: 'save',
            title: st.disconnected ? 'El editor está cerrado' : 'Los cambios no se guardan',
            html: (st.disconnected
                ? '<p>Se cerró la ventana de <strong>abrir-editor.cmd</strong>, que es la que escribe los cambios en el disco.</p>'
                : '<p>Abriste el archivo directamente (doble clic), sin el editor. Podés editar y descargar el PDF, pero <strong>al cerrar la pestaña se pierde todo</strong>.</p>') +
                '<p>Para que se guarde solo: abrí <code>abrir-editor.cmd</code> con doble clic, en la misma carpeta que este documento.</p>'
        });
    }
    function explainCompiled() {
        modal({
            type: 'info', icon: 'lock',
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
            if (st.mode === 'server') save(false).then(function (ok) { if (ok) toast({ type: 'success', icon: 'save', title: 'Guardado', msg: 'Cambios escritos en <code>' + esc(fileName) + '</code>.', duration: 2500, id: 'save' }); });
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
        mountBar();
        mountUi();
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });

        var restore = session('pd-editor-restore');
        if (restore) {
            if (restore.zoom && typeof window.changeZoom === 'function') {
                var z = document.getElementById('zoomSelector'); if (z) z.value = restore.zoom;
                window.changeZoom(restore.zoom);
                syncZoom();
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
                else toast({ type: 'success', icon: 'save', title: 'Guardado automático activo', msg: 'Hacé clic en cualquier texto para editarlo. Cada cambio se guarda solo en <code>' + esc(fileName) + '</code>.', duration: 4500, id: 'mode' });
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

    window.__pdEditor = { undo: undo, redo: redo, reset: resetAll, save: function () { return save(false); }, toast: toast, modal: modal, icon: icon, state: st };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
