/**
 * Allure report enhancement: embed waveform viewer attachments directly into
 * the test case detail page.
 *
 * Injected into the generated report's index.html by
 * tools/enhance_allure_report.py. Finds HTML attachments whose name matches
 * NAME_RE (the waveform scope attachments) and inserts, at the top of the
 * case detail view:
 *   - a complete scaled-down (1440x900 logical, CSS-transform scaled to fit)
 *     and fully interactive iframe preview, and
 *   - a "fullscreen" button that opens a full-viewport interactive overlay.
 *
 * Works with the Allure 3 SPA: a MutationObserver re-runs the scan whenever
 * the report navigates between cases.
 */
(function () {
  'use strict';

  var LOGICAL_W = 1440;
  var LOGICAL_H = 900;
  /* Attachments whose display name starts with these get embedded. */
  var NAME_RE = /^(waveform analysis|motor waveforms)/i;
  var PROCESSED_ATTR = 'data-wf-embed';

  /* ---- styles ------------------------------------------------------------ */

  var css = [
    '.wf-embeds{display:flex;flex-direction:column;gap:12px}',
    '.wf-embed{margin:12px 16px;border:1px solid #d5dbe3;border-radius:10px;background:#0a0e14;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.15)}',
    '.wf-embed__header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;background:#f5f7fa;border-bottom:1px solid #d5dbe3;flex-wrap:wrap}',
    '.wf-embed__title{font:600 13px/1.4 system-ui,sans-serif;color:#1f2d3d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}',
    '.wf-embed__hint{font:400 11px/1.4 system-ui,sans-serif;color:#7d8fa5;white-space:nowrap}',
    '.wf-embed__actions{display:flex;gap:8px;flex-shrink:0}',
    '.wf-btn{font:500 12px/1 system-ui,sans-serif;padding:7px 14px;border-radius:6px;border:1px solid #c4ccd6;background:#fff;color:#33445c;cursor:pointer;white-space:nowrap}',
    '.wf-btn:hover{border-color:#38bdf8;color:#0284c7}',
    '.wf-embed__scaler{position:relative;overflow:hidden;background:#0a0e14}',
    '.wf-embed__iframe{position:absolute;top:0;left:0;border:0;transform-origin:0 0;width:' + LOGICAL_W + 'px;height:' + LOGICAL_H + 'px;display:block}',
    '.wf-embed_collapsed .wf-embed__scaler{display:none}',
    '.wf-overlay{position:fixed;inset:0;z-index:2147483000;background:#0b0f14;display:flex;flex-direction:column}',
    '.wf-overlay__header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#10161f;border-bottom:1px solid #1e2a3a}',
    '.wf-overlay__title{font:600 14px/1.4 system-ui,sans-serif;color:#d7e1ec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}',
    '.wf-overlay__iframe{flex:1;width:100%;border:0;display:block}',
    '.wf-overlay__close{font:500 13px/1 system-ui,sans-serif;padding:8px 16px;border-radius:6px;border:1px solid #33445c;background:#1a2331;color:#d7e1ec;cursor:pointer;white-space:nowrap}',
    '.wf-overlay__close:hover{border-color:#38bdf8;color:#38bdf8}',
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---- embed --------------------------------------------------------------- */

  function createEmbed(src, title) {
    var embed = document.createElement('div');
    embed.className = 'wf-embed';
    embed.setAttribute('data-wf-src', src);
    embed.innerHTML =
      '<div class="wf-embed__header">' +
      '<span class="wf-embed__title"></span>' +
      '<span class="wf-embed__hint">缩小版可直接交互：拖选区域 · A/B 游标 · 滚轮缩放</span>' +
      '<div class="wf-embed__actions">' +
      '<button type="button" class="wf-btn wf-btn--collapse">收起</button>' +
      '<button type="button" class="wf-btn wf-btn--fullscreen">⛶ 全屏互动</button>' +
      '</div>' +
      '</div>' +
      '<div class="wf-embed__scaler"><iframe class="wf-embed__iframe" loading="lazy"></iframe></div>';

    embed.querySelector('.wf-embed__title').textContent = '📈 ' + title;

    var iframe = embed.querySelector('.wf-embed__iframe');
    iframe.title = 'Waveform viewer: ' + title;
    iframe.src = src;

    /* scale the logical-size iframe to the container width */
    var scaler = embed.querySelector('.wf-embed__scaler');
    function rescale() {
      var w = scaler.clientWidth;
      if (!w) return;
      var s = w / LOGICAL_W;
      iframe.style.transform = 'scale(' + s + ')';
      scaler.style.height = LOGICAL_H * s + 'px';
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(rescale).observe(scaler);
    }
    window.addEventListener('resize', rescale);
    /* initial pass once inserted */
    requestAnimationFrame(rescale);

    /* collapse / expand */
    var collapseBtn = embed.querySelector('.wf-btn--collapse');
    collapseBtn.addEventListener('click', function () {
      var collapsed = embed.classList.toggle('wf-embed_collapsed');
      collapseBtn.textContent = collapsed ? '展开波形' : '收起';
      if (!collapsed) requestAnimationFrame(rescale);
    });

    /* fullscreen overlay */
    embed.querySelector('.wf-btn--fullscreen').addEventListener('click', function () {
      openFullscreen(src, title);
    });

    return embed;
  }

  var openOverlay = null;

  function openFullscreen(src, title) {
    if (openOverlay) closeFullscreen();

    var overlay = document.createElement('div');
    overlay.className = 'wf-overlay';
    overlay.innerHTML =
      '<div class="wf-overlay__header">' +
      '<span class="wf-overlay__title"></span>' +
      '<button type="button" class="wf-overlay__close">✕ 退出全屏 (Esc)</button>' +
      '</div>' +
      '<iframe class="wf-overlay__iframe"></iframe>';
    overlay.querySelector('.wf-overlay__title').textContent = '📈 ' + title;
    overlay.querySelector('.wf-overlay__iframe').title = 'Waveform viewer: ' + title;
    overlay.querySelector('.wf-overlay__iframe').src = src;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    openOverlay = overlay;

    overlay.querySelector('.wf-overlay__close').addEventListener('click', closeFullscreen);
    document.addEventListener('keydown', onEsc);

    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(function () {
        /* browser fullscreen optional — the overlay already covers the viewport */
      });
    }
  }

  function onEsc(e) {
    if (e.key === 'Escape') closeFullscreen();
  }

  function closeFullscreen() {
    if (!openOverlay) return;
    openOverlay.remove();
    openOverlay = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onEsc);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  }

  /* ---- scanning ------------------------------------------------------------ */

  var scheduled = false;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      process();
    }, 60);
  }

  function process() {
    var rows = document.querySelectorAll('.attachment-row[data-type="text/html"]');
    var containers = new Map();

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.hasAttribute(PROCESSED_ATTR)) continue;
      var nameEl = row.querySelector('.attachment-row__name');
      var name = nameEl ? nameEl.textContent.trim() : '';
      if (!NAME_RE.test(name)) continue;

      var container = row.closest('.test-result__content') || row.closest('.test-result');
      if (!container) continue;

      row.setAttribute(PROCESSED_ATTR, '1');
      if (!containers.has(container)) containers.set(container, []);
      containers.get(container).push({ uid: row.getAttribute('data-uid'), name: name });
    }

    containers.forEach(function (items, container) {
      if (!container.isConnected) return;
      var host = container.querySelector(':scope > .wf-embeds');
      if (!host) {
        host = document.createElement('div');
        host.className = 'wf-embeds';
        container.insertBefore(host, container.firstChild);
      }
      items.forEach(function (item) {
        var src = 'data/attachments/' + item.uid + '.html';
        if (host.querySelector('[data-wf-src="' + src + '"]')) return; /* dedupe on re-render */
        host.appendChild(createEmbed(src, item.name));
      });
    });
  }

  var observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
})();
