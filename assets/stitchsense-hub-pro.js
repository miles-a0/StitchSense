(function () {
  async function ssParseJsonResponse(response) {
    const raw = await response.text();
    if (!raw) {
      throw new Error('Webhook returned an empty response. HTTP ' + response.status + '. Check the latest n8n execution and Respond to Webhook node.');
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error('Webhook returned non-JSON response. HTTP ' + response.status + ': ' + raw.slice(0, 180));
    }
  }



  function ssDecodeHtmlEntities(value) {
    const div = document.createElement('textarea');
    div.innerHTML = String(value || '');
    return div.value;
  }

  function ssExtractSummaryPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    let structured = source.structured_data || source.pattern_summary || source.summary || null;
    let answer = source.answer || source.overview || '';

    function tryJson(text) {
      const attempts = [];
      let raw = ssDecodeHtmlEntities(String(text || '')).trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      if (!raw) return null;
      attempts.push(raw);
      if (raw.charAt(0) !== '{') attempts.push('{' + raw + '}');
      if (/"pattern_summary"\s*:\s*"?\s*"?pattern_title"/i.test(raw) || (/"pattern_summary"\s*:/i.test(raw) && !/"pattern_summary"\s*:\s*\{/i.test(raw))) {
        let fixed = raw;
        if (fixed.charAt(0) !== '{') fixed = '{' + fixed;
        fixed = fixed.replace(/"pattern_summary"\s*:\s*/i, '"pattern_summary":{');
        if (fixed.charAt(fixed.length - 1) !== '}') fixed += '}';
        fixed += '}';
        attempts.push(fixed);
      }
      for (const attempt of attempts) {
        try { return JSON.parse(attempt); } catch (e) {}
      }
      return null;
    }

    if (!structured && typeof answer === 'string') {
      const parsed = tryJson(answer);
      if (parsed && typeof parsed === 'object') {
        structured = parsed.pattern_summary || parsed.structured_data || parsed.summary || null;
        answer = parsed.answer || parsed.overview || answer;
      }
    }

    if (!structured && source.output && typeof source.output === 'string') {
      const parsed = tryJson(source.output);
      if (parsed && typeof parsed === 'object') {
        structured = parsed.pattern_summary || parsed.structured_data || parsed.summary || null;
        answer = parsed.answer || parsed.overview || answer;
      }
    }

    return { answer: String(answer || '').trim(), structured: structured || null };
  }

  function ssPickChatAnswer(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const direct = source.answer || source.message || source.response || source.output || source.text || source.analysis || '';
    if (direct && typeof direct === 'string') return direct;
    if (source.data && typeof source.data === 'object') {
      return source.data.answer || source.data.message || source.data.response || source.data.output || source.data.text || '';
    }
    if (source.result && typeof source.result === 'object') {
      return source.result.answer || source.result.message || source.result.response || source.result.output || source.result.text || '';
    }
    return '';
  }

  function ssEnsureSummaryTitle(structured, title) {
    const summary = structured && typeof structured === 'object' && !Array.isArray(structured) ? Object.assign({}, structured) : {};
    if (title && !summary.pattern_title) summary.pattern_title = title;
    return summary;
  }

  const cfg = window.StitchSenseHubPro || {};
  const ssSiteOrigin = window.location.origin;
  const ssScriptSrc = (function(){
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || '';
      if (src.indexOf('/stitchsense-assistant-hub-pro/') !== -1 && src.indexOf('stitchsense-hub-pro.js') !== -1) return src;
    }
    return '';
  })();
  const ssPluginBase = ssScriptSrc ? ssScriptSrc.split('/assets/stitchsense-hub-pro.js')[0] + '/' : '';
  const ssSameOriginPluginBase = ssPluginBase ? ssPluginBase.replace(/^https?:\/\/[^/]+/i, ssSiteOrigin) : '';
  const ssAjaxUrl = ssSiteOrigin + '/wp-admin/admin-ajax.php';
  const ssRestBase = ssSiteOrigin + '/wp-json/stitchsense/v1/';
  const endpoint = cfg.endpoint || '';
  const pluginChatProxyEndpoint = cfg.pluginChatProxyEndpoint || (ssSameOriginPluginBase ? ssSameOriginPluginBase + 'stitchsense-chat-proxy.php' : '');
  const restChatEndpoint = cfg.restChatEndpoint || (ssRestBase + 'chat-proxy');
  const chatAjaxEndpoint = cfg.chatAjaxEndpoint || ssAjaxUrl;
  const chatAdminPostEndpoint = cfg.chatAdminPostEndpoint || (ssSiteOrigin + '/wp-admin/admin-post.php');
  const chatProxyAction = cfg.chatProxyAction || 'stitchsense_chat_proxy';
  const directChatEndpoint = cfg.directChatEndpoint || '';
  const pluginUploadProxyEndpoint = cfg.pluginUploadProxyEndpoint || cfg.uploadEndpoint || '';
  const uploadEndpoint = cfg.uploadEndpoint || pluginUploadProxyEndpoint || '';
  const restUploadEndpoint = cfg.restUploadEndpoint || (ssRestBase + 'upload-proxy');
  const directUploadEndpoint = cfg.directUploadEndpoint || '';
  const imageEndpoint = cfg.imageEndpoint || ssAjaxUrl;
  const pluginImageProxyEndpoint = cfg.pluginImageProxyEndpoint || (ssSameOriginPluginBase ? ssSameOriginPluginBase + 'stitchsense-image-proxy.php' : '');
  const restImageEndpoint = cfg.restImageEndpoint || (ssRestBase + 'image-analysis');
  const imageProxyAction = cfg.imageProxyAction || 'stitchsense_image_analysis_proxy';
  let wpRestNonce = cfg.wpRestNonce || '';
  const restNonceEndpoint = cfg.restNonceEndpoint || (ssRestBase + 'nonce');
  const restNonceAjaxAction = cfg.restNonceAjaxAction || 'stitchsense_rest_nonce';
  const secret = '';
  const isUserLoggedIn = !!cfg.isUserLoggedIn;
  const currentUserId = cfg.currentUserId || 0;
  const currentUserName = cfg.currentUserName || '';
  const currentUserAvatar = cfg.currentUserAvatar || '';
  const loginUrl = cfg.loginUrl || '/wp-login.php';
  const registerUrl = cfg.registerUrl || '/wp-login.php?action=register';
  const accountUrl = cfg.accountUrl || '/wp-admin/profile.php';
  const logoutUrl = cfg.logoutUrl || '/wp-login.php?action=logout';
  const restUrl = cfg.restUrl || '';
  const ravelryStatusEndpoint = cfg.ravelryStatusEndpoint || (ssRestBase + 'ravelry/status');
  const ravelryConnectEndpoint = cfg.ravelryConnectEndpoint || (ssRestBase + 'ravelry/connect-url');
  const ravelrySearchEndpoint = ssRestBase + 'ravelry/search';
  const ravelryPatternEndpoint = ssRestBase + 'ravelry/pattern';
  const ravelrySavedEndpoint = ssRestBase + 'ravelry/saved';
  const directImageEndpoint = '';
  const adminChatModel = cfg.chatModel || '';
  const adminVisionModel = cfg.visionModel || '';
  const ssNativeFetch = window.fetch ? window.fetch.bind(window) : null;
  let ssRestNonceRefreshPromise = null;

  function ssFetchUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    try { return String(input || ''); } catch (e) { return ''; }
  }

  function ssIsStitchSenseRestUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin === ssSiteOrigin && parsed.pathname.indexOf('/wp-json/stitchsense/v1/') !== -1;
    } catch (e) {
      return String(url).indexOf('/wp-json/stitchsense/v1/') !== -1;
    }
  }

  function ssIsNonceEndpoint(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.pathname.replace(/\/+$/, '').endsWith('/wp-json/stitchsense/v1/nonce');
    } catch (e) {
      return String(url).replace(/\/+$/, '').indexOf('/wp-json/stitchsense/v1/nonce') !== -1;
    }
  }

  function ssLooksLikeCookieCheckFailure(raw) {
    const text = String(raw || '').toLowerCase();
    return text.indexOf('cookie check failed') !== -1 ||
      text.indexOf('rest_cookie_invalid_nonce') !== -1 ||
      text.indexOf('invalid nonce') !== -1;
  }

  function ssRememberResponseNonce(response) {
    if (!response || !response.headers || !response.headers.get) return;
    const fresh = response.headers.get('X-WP-Nonce') || response.headers.get('x-wp-nonce');
    if (fresh) wpRestNonce = fresh;
  }

  async function ssRefreshWpRestNonce() {
    if (!ssNativeFetch) return '';
    if (!ssRestNonceRefreshPromise) {
      const form = new FormData();
      form.append('action', restNonceAjaxAction);
      ssRestNonceRefreshPromise = ssNativeFetch(ssAjaxUrl, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
        body: form
      })
        .then(async function(response) {
          ssRememberResponseNonce(response);
          const raw = await response.text();
          let data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
          if (response.ok && data && data.nonce) {
            wpRestNonce = String(data.nonce || '');
          }
          return wpRestNonce;
        })
        .then(function(nonce) {
          if (nonce || !restNonceEndpoint) return nonce;
          return ssNativeFetch(restNonceEndpoint, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      })
        .then(async function(response) {
          ssRememberResponseNonce(response);
          const raw = await response.text();
          let data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
          if (response.ok && data && data.nonce) {
            wpRestNonce = String(data.nonce || '');
          }
          return wpRestNonce;
          });
        })
        .catch(function() { return ''; })
        .finally(function() { ssRestNonceRefreshPromise = null; });
    }
    return ssRestNonceRefreshPromise;
  }

  function ssRetryInitWithFreshNonce(input, init) {
    const next = Object.assign({}, init || {});
    const headers = new Headers();
    if (input && input.headers && typeof input.headers.forEach === 'function') {
      input.headers.forEach(function(value, key) { headers.set(key, value); });
    }
    if (next.headers) {
      new Headers(next.headers).forEach(function(value, key) { headers.set(key, value); });
    }
    if (wpRestNonce) headers.set('X-WP-Nonce', wpRestNonce);
    next.headers = headers;
    next.__ssNonceRetry = true;
    return next;
  }

  if (ssNativeFetch) {
    window.fetch = async function ssStitchSenseFetch(input, init) {
      const url = ssFetchUrl(input);
      const response = await ssNativeFetch(input, init);
      ssRememberResponseNonce(response);

      if (
        !ssIsStitchSenseRestUrl(url) ||
        ssIsNonceEndpoint(url) ||
        response.status !== 403 ||
        (init && init.__ssNonceRetry)
      ) {
        return response;
      }

      let raw = '';
      try { raw = await response.clone().text(); } catch (e) { raw = ''; }
      if (!ssLooksLikeCookieCheckFailure(raw)) {
        return response;
      }

      const fresh = await ssRefreshWpRestNonce();
      if (!fresh) {
        return response;
      }

      const retry = await ssNativeFetch(input, ssRetryInitWithFreshNonce(input, init));
      ssRememberResponseNonce(retry);
      return retry;
    };
  }

  function ssBuildChatPayload(payload) {
    const out = Object.assign({}, payload || {});
    if (adminVisionModel || adminChatModel) {
      const hasPattern = !!(out.project_id);
      const isVisionTool = out.tool_mode === 'stitch_image_analysis';
      if (isVisionTool && adminVisionModel && !out.model) {
        out.model = adminVisionModel;
      } else if (adminChatModel && !out.model) {
        out.model = adminChatModel;
      }
    }
    return out;
  }

  async function ssPostChat(payload) {
    const basePayload = ssBuildChatPayload(Object.assign({}, payload || {}));
    const jsonBody = JSON.stringify(basePayload);
    const attempts = [];

    async function tryRequest(label, url, options) {
      if (!url) return null;
      try {
        const response = await fetch(url, Object.assign({ method: 'POST', credentials: 'same-origin', cache: 'no-store' }, options || {}));
        attempts.push(label + ' ' + response.status);
        return response;
      } catch (error) {
        attempts.push(label + ' failed');
        return null;
      }
    }

    function formPayload(actionName) {
      const form = new FormData();
      form.append('action', actionName || chatProxyAction);
      form.append('payload', jsonBody);
      return form;
    }

    const restUrls = [restChatEndpoint, ssRestBase + 'chat-proxy'].filter(Boolean).filter(function(url, index, arr){ return arr.indexOf(url) === index; });
    for (const url of restUrls) {
      const response = await tryRequest('rest', url, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-WP-Nonce': wpRestNonce
        },
        body: jsonBody
      });
      if (response && response.status !== 404 && response.status !== 405) {
        response.ssDebugAttempts = attempts.slice();
        return response;
      }
    }

    const localProxyUrls = [
      pluginChatProxyEndpoint,
      ssSameOriginPluginBase ? ssSameOriginPluginBase + 'stitchsense-chat-proxy.php' : ''
    ].filter(Boolean).filter(function(url, index, arr){ return arr.indexOf(url) === index; });

    for (const url of localProxyUrls) {
      const response = await tryRequest('local-php', url, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: jsonBody
      });
      if (response && response.status !== 404 && response.status !== 405) {
        response.ssDebugAttempts = attempts.slice();
        return response;
      }
    }

    const ajaxUrls = [chatAjaxEndpoint, ssAjaxUrl].filter(Boolean).filter(function(url, index, arr){ return arr.indexOf(url) === index; });
    for (const url of ajaxUrls) {
      const response = await tryRequest('admin-ajax', url, {
        body: formPayload(chatProxyAction)
      });
      if (response && response.status !== 404 && response.status !== 405) {
        response.ssDebugAttempts = attempts.slice();
        return response;
      }
    }

    const postUrls = [chatAdminPostEndpoint, ssSiteOrigin + '/wp-admin/admin-post.php'].filter(Boolean).filter(function(url, index, arr){ return arr.indexOf(url) === index; });
    for (const url of postUrls) {
      const response = await tryRequest('admin-post', url, {
        body: formPayload(chatProxyAction)
      });
      if (response && response.status !== 404 && response.status !== 405) {
        response.ssDebugAttempts = attempts.slice();
        return response;
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'StitchSense chat proxy is not reachable from WordPress. Tried: ' + (attempts.join(', ') || 'no proxy candidates') + '. Active plugin build expected: 7.7.38.'
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const supportedPatternExtensions = ['pdf','docx','txt','rtf','odt','md','html','htm','epub','csv','xlsx','json','xml','jpg','jpeg','png','webp','gif','tif','tiff'];
  const supportedPatternMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/rtf', 'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'text/markdown', 'text/x-markdown',
    'text/html', 'application/xhtml+xml',
    'application/epub+zip',
    'text/csv', 'application/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json', 'text/json',
    'application/xml', 'text/xml',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'
  ];
  const supportedPatternAccept = supportedPatternExtensions.map(function(ext){ return '.' + ext; }).concat(supportedPatternMimeTypes).join(',');
  const SS_PATTERN_MAX_BYTES = 50 * 1024 * 1024;
  const SS_PATTERN_INLINE_UPLOAD_BYTES = 8 * 1024 * 1024;
  const supportedPatternHelpText = 'PDF, DOCX, TXT, RTF, ODT, MD, HTML, EPUB, CSV, XLSX, JSON, XML, JPG, PNG, WebP, GIF and TIFF. Maximum 50 MB.';
  function getFileExtension(fileName) {
    const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }
  function isSupportedPatternFile(file) {
    if (!file) return false;
    const ext = getFileExtension(file.name || '');
    const mime = String(file.type || '').toLowerCase();
    return supportedPatternExtensions.indexOf(ext) !== -1 || supportedPatternMimeTypes.indexOf(mime) !== -1;
  }
  function isPdfPatternFile(file) {
    return !!file && (String(file.type || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
  }

  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const stitchItems = [
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "k",
        "name": "Knit",
        "abbr": "k",
        "uk": "k",
        "us": "k",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work stitch through front loop to make a knit stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "blank / |"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "p",
        "name": "Purl",
        "abbr": "p",
        "uk": "p",
        "us": "p",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work stitch from front to make a purl bump.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "—"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "k tbl",
        "name": "Knit through back loop",
        "abbr": "k tbl",
        "uk": "k tbl",
        "us": "k tbl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Twisted knit stitch worked through back loop.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "k tbl"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "p tbl",
        "name": "Purl through back loop",
        "abbr": "p tbl",
        "uk": "p tbl",
        "us": "p tbl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Twisted purl stitch worked through back loop.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "p tbl"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "sl1k",
        "name": "Slip stitch knitwise",
        "abbr": "sl1k",
        "uk": "sl1k",
        "us": "sl1k",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Slip one stitch as if to knit.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "sl kw"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "sl1p",
        "name": "Slip stitch purlwise",
        "abbr": "sl1p",
        "uk": "sl1p",
        "us": "sl1p",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Slip one stitch as if to purl.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "sl pw"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "yo",
        "name": "Yarn over",
        "abbr": "yo",
        "uk": "yo",
        "us": "yo",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Bring yarn over needle to create an eyelet and increase.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "O"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "yfwd",
        "name": "Yarn forward",
        "abbr": "yfwd",
        "uk": "yfwd",
        "us": "yfwd",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Move yarn forward; often equivalent to yarn over depending on context.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "yf / yfwd"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "yrn",
        "name": "Yarn round needle",
        "abbr": "yrn",
        "uk": "yrn",
        "us": "yrn",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Wrap yarn round needle, commonly between purl and knit stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "yrn"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "yon",
        "name": "Yarn over needle",
        "abbr": "yon",
        "uk": "yon",
        "us": "yon",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Yarn over needle, commonly between knit and purl stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "yon"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "no st",
        "name": "No stitch",
        "abbr": "no st",
        "uk": "no st",
        "us": "no st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Placeholder in charts; ignore this box.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "black square"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "pm",
        "name": "Place marker",
        "abbr": "pm",
        "uk": "pm",
        "us": "pm",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Place a stitch marker on the needle.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "PM"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "sm",
        "name": "Slip marker",
        "abbr": "sm",
        "uk": "sm",
        "us": "sm",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Move marker from left to right needle.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "SM"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "rm",
        "name": "Remove marker",
        "abbr": "rm",
        "uk": "rm",
        "us": "rm",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Remove marker from work.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "RM"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "turn",
        "name": "Turn work",
        "abbr": "turn",
        "uk": "turn",
        "us": "turn",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Turn fabric to work back across stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "turn"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "wyif",
        "name": "With yarn in front",
        "abbr": "wyif",
        "uk": "wyif",
        "us": "wyif",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold working yarn at front while slipping/working.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "wyif"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "wyib",
        "name": "With yarn in back",
        "abbr": "wyib",
        "uk": "wyib",
        "us": "wyib",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold working yarn at back while slipping/working.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "wyib"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "co",
        "name": "Cast on",
        "abbr": "co",
        "uk": "co",
        "us": "co",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Create new stitches on needle.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "CO"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "cast off",
        "name": "Bind off / cast off",
        "abbr": "cast off",
        "uk": "cast off",
        "us": "bind off",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Finish stitches so they do not unravel.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "BO / CO"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "cast off kw",
        "name": "Bind off knitwise",
        "abbr": "cast off kw",
        "uk": "cast off kw",
        "us": "bind off kw",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Cast/bind off using knit stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "BO kw"
    },
    {
        "type": "knitting",
        "category": "Basic",
        "symbol": "cast off pw",
        "name": "Bind off purlwise",
        "abbr": "cast off pw",
        "uk": "cast off pw",
        "us": "bind off pw",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Cast/bind off using purl stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "BO pw"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "m1",
        "name": "Make one",
        "abbr": "m1",
        "uk": "m1",
        "us": "m1",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Increase by lifting strand between stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "M1"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "m1l",
        "name": "Make one left",
        "abbr": "m1l",
        "uk": "m1l",
        "us": "m1l",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Left-leaning lifted-bar increase.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "M1L"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "m1r",
        "name": "Make one right",
        "abbr": "m1r",
        "uk": "m1r",
        "us": "m1r",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Right-leaning lifted-bar increase.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "M1R"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "kfb",
        "name": "Knit front and back",
        "abbr": "kfb",
        "uk": "kfb",
        "us": "kfb",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Knit into front and back of same stitch; one stitch increased.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "kfb"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "pfb",
        "name": "Purl front and back",
        "abbr": "pfb",
        "uk": "pfb",
        "us": "pfb",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Purl into front and back of same stitch; one stitch increased.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "pfb"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "kfbf",
        "name": "Knit front, back, front",
        "abbr": "kfbf",
        "uk": "kfbf",
        "us": "kfbf",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Double increase worked into one stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "kfbf"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "pfbf",
        "name": "Purl front, back, front",
        "abbr": "pfbf",
        "uk": "pfbf",
        "us": "pfbf",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Double purl-side increase worked into one stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "pfbf"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "k1b",
        "name": "Knit one below",
        "abbr": "k1b",
        "uk": "k1b",
        "us": "k1b",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Knit into stitch below the next stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "k1b / k-b"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "lli",
        "name": "Lifted increase left",
        "abbr": "lli",
        "uk": "lli",
        "us": "lli",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Increase by knitting into left leg of stitch below.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "LLI"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "rli",
        "name": "Lifted increase right",
        "abbr": "rli",
        "uk": "rli",
        "us": "rli",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Increase by knitting into right leg of stitch below.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "RLI"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "bl inc",
        "name": "Backward loop increase",
        "abbr": "bl inc",
        "uk": "bl inc",
        "us": "bl inc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Cast on one stitch by making a backward loop.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "loop"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "cable co",
        "name": "Cable cast-on increase",
        "abbr": "cable co",
        "uk": "cable co",
        "us": "cable co",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Add stitches using cable cast-on method.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "co"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "bar inc",
        "name": "Bar increase",
        "abbr": "bar inc",
        "uk": "bar inc",
        "us": "bar inc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Increase creating a small visible bar.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "bar"
    },
    {
        "type": "knitting",
        "category": "Increase",
        "symbol": "cdi",
        "name": "Central double increase",
        "abbr": "cdi",
        "uk": "cdi",
        "us": "cdi",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Increase two stitches centred from one stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "CDI"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "k2tog",
        "name": "Knit two together",
        "abbr": "k2tog",
        "uk": "k2tog",
        "us": "k2tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Right-leaning single decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "/"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "k3tog",
        "name": "Knit three together",
        "abbr": "k3tog",
        "uk": "k3tog",
        "us": "k3tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Right-leaning double decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "//"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "p2tog",
        "name": "Purl two together",
        "abbr": "p2tog",
        "uk": "p2tog",
        "us": "p2tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Purl-side single decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "p2tog"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "p3tog",
        "name": "Purl three together",
        "abbr": "p3tog",
        "uk": "p3tog",
        "us": "p3tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Purl-side double decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "p3tog"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "ssk",
        "name": "Slip slip knit",
        "abbr": "ssk",
        "uk": "ssk",
        "us": "ssk",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Left-leaning single decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "\\"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "ssp",
        "name": "Slip slip purl",
        "abbr": "ssp",
        "uk": "ssp",
        "us": "ssp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Left-leaning purl-side decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "ssp"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "skpo",
        "name": "Slip one, knit one, pass slipped stitch over",
        "abbr": "skpo",
        "uk": "skpo",
        "us": "skp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Left-leaning decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "skp"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "psso",
        "name": "Pass slipped stitch over",
        "abbr": "psso",
        "uk": "psso",
        "us": "psso",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Pass slipped stitch over worked stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "psso"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "cdd",
        "name": "Central double decrease",
        "abbr": "cdd",
        "uk": "cdd",
        "us": "cdd",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Centred double decrease, often sl2-k1-p2sso.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "CDD"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "sl1-k2tog-psso",
        "name": "Slip one, k2tog, pass slipped stitch over",
        "abbr": "sl1-k2tog-psso",
        "uk": "sl1-k2tog-psso",
        "us": "sl1-k2tog-psso",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Centred or near-centred double decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "sl-k2tog-pss"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "k2tog tbl",
        "name": "Knit two together through back loop",
        "abbr": "k2tog tbl",
        "uk": "k2tog tbl",
        "us": "k2tog tbl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Twisted decrease through back loops.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "k2tog tbl"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "p2tog tbl",
        "name": "Purl two together through back loop",
        "abbr": "p2tog tbl",
        "uk": "p2tog tbl",
        "us": "p2tog tbl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Twisted purl-side decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "p2tog tbl"
    },
    {
        "type": "knitting",
        "category": "Decrease",
        "symbol": "sk2p",
        "name": "Slip, knit, pass two slipped over",
        "abbr": "sk2p",
        "uk": "sk2p",
        "us": "sk2p",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Double decrease used in lace.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "sk2p"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "garter st",
        "name": "Garter stitch",
        "abbr": "garter st",
        "uk": "garter st",
        "us": "garter st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Rows of knit stitches when worked flat; ridged, reversible fabric.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "garter"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "st st",
        "name": "Stocking stitch / Stockinette",
        "abbr": "st st",
        "uk": "st st",
        "us": "st st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Knit right side and purl wrong side; smooth V fabric.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "stocking"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "rev st st",
        "name": "Reverse stocking stitch",
        "abbr": "rev st st",
        "uk": "rev st st",
        "us": "rev st st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Purl side of stocking stitch shown as right side.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "rev st st"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "1x1 rib",
        "name": "Rib 1x1",
        "abbr": "1x1 rib",
        "uk": "1x1 rib",
        "us": "1x1 rib",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternating knit and purl columns; elastic.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "k1 p1"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "2x2 rib",
        "name": "Rib 2x2",
        "abbr": "2x2 rib",
        "uk": "2x2 rib",
        "us": "2x2 rib",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Two knit and two purl columns; elastic.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "k2 p2"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "moss st",
        "name": "Seed stitch",
        "abbr": "moss st",
        "uk": "moss st",
        "us": "seed st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternating knit and purl stitches, offset each row.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "seed"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "moss st",
        "name": "Moss stitch",
        "abbr": "moss st",
        "uk": "moss st",
        "us": "moss/seed st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "UK moss is often US seed; check pattern key.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "moss"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "double moss",
        "name": "Double moss stitch",
        "abbr": "double moss",
        "uk": "double moss",
        "us": "double moss",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternating knit/purl blocks over two rows.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "dbl moss"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "basketweave",
        "name": "Basketweave",
        "abbr": "basketweave",
        "uk": "basketweave",
        "us": "basketweave",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Blocks of knit and purl forming woven texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "basket"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "waffle st",
        "name": "Waffle stitch",
        "abbr": "waffle st",
        "uk": "waffle st",
        "us": "waffle st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised square texture from knit/purl arrangement.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "waffle"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "herringbone st",
        "name": "Herringbone stitch",
        "abbr": "herringbone st",
        "uk": "herringbone st",
        "us": "herringbone st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Dense slanted texture often using slipped/decreased stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "herringbone"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "linen st",
        "name": "Linen stitch",
        "abbr": "linen st",
        "uk": "linen st",
        "us": "linen st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Woven-look fabric from slipped stitches and yarn position.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "linen"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "brk",
        "name": "Brioche knit",
        "abbr": "brk",
        "uk": "brk",
        "us": "brk",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Knit stitch together with its yarn-over in brioche.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "brk"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "brp",
        "name": "Brioche purl",
        "abbr": "brp",
        "uk": "brp",
        "us": "brp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Purl stitch together with its yarn-over in brioche.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "brp"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "fisherman’s rib",
        "name": "Fisherman’s rib",
        "abbr": "fisherman’s rib",
        "uk": "fisherman’s rib",
        "us": "fisherman’s rib",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Squishy rib often worked into stitch below.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "fisherman"
    },
    {
        "type": "knitting",
        "category": "Texture/Fabric",
        "symbol": "English rib",
        "name": "English rib",
        "abbr": "English rib",
        "uk": "English rib",
        "us": "English rib",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Ribbed fabric similar to brioche/fisherman’s rib.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "eng rib"
    },
    {
        "type": "knitting",
        "category": "Colourwork",
        "symbol": "Fair Isle",
        "name": "Fair Isle / stranded knitting",
        "abbr": "Fair Isle",
        "uk": "Fair Isle",
        "us": "Fair Isle",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Stranded colourwork carrying unused yarn across back.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "colour grid"
    },
    {
        "type": "knitting",
        "category": "Colourwork",
        "symbol": "intarsia",
        "name": "Intarsia",
        "abbr": "intarsia",
        "uk": "intarsia",
        "us": "intarsia",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Colour blocks worked with separate yarn lengths.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "colour block"
    },
    {
        "type": "knitting",
        "category": "Colourwork",
        "symbol": "mosaic",
        "name": "Mosaic knitting",
        "abbr": "mosaic",
        "uk": "mosaic",
        "us": "mosaic",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Slip-stitch colourwork using one colour per row/round.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "slip colour"
    },
    {
        "type": "knitting",
        "category": "Colourwork",
        "symbol": "duplicate st",
        "name": "Duplicate stitch",
        "abbr": "duplicate st",
        "uk": "duplicate st",
        "us": "duplicate st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Embroider V-shaped stitches over finished knitting.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knitting-abbreviations",
        "visual": "embroider"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C2F",
        "name": "2-stitch cable front",
        "abbr": "C2F",
        "uk": "C2F",
        "us": "C2F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 1 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C2F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C2B",
        "name": "2-stitch cable back",
        "abbr": "C2B",
        "uk": "C2B",
        "us": "C2B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 1 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C2B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C3F",
        "name": "3-stitch cable front",
        "abbr": "C3F",
        "uk": "C3F",
        "us": "C3F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 1 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C3F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C3B",
        "name": "3-stitch cable back",
        "abbr": "C3B",
        "uk": "C3B",
        "us": "C3B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 1 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C3B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C4F",
        "name": "4-stitch cable front",
        "abbr": "C4F",
        "uk": "C4F",
        "us": "C4F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 2 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C4F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C4B",
        "name": "4-stitch cable back",
        "abbr": "C4B",
        "uk": "C4B",
        "us": "C4B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 2 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C4B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C5F",
        "name": "5-stitch cable front",
        "abbr": "C5F",
        "uk": "C5F",
        "us": "C5F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 2 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C5F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C5B",
        "name": "5-stitch cable back",
        "abbr": "C5B",
        "uk": "C5B",
        "us": "C5B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 2 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C5B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C6F",
        "name": "6-stitch cable front",
        "abbr": "C6F",
        "uk": "C6F",
        "us": "C6F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 3 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C6F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C6B",
        "name": "6-stitch cable back",
        "abbr": "C6B",
        "uk": "C6B",
        "us": "C6B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 3 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C6B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C8F",
        "name": "8-stitch cable front",
        "abbr": "C8F",
        "uk": "C8F",
        "us": "C8F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 4 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C8F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C8B",
        "name": "8-stitch cable back",
        "abbr": "C8B",
        "uk": "C8B",
        "us": "C8B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 4 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C8B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C10F",
        "name": "10-stitch cable front",
        "abbr": "C10F",
        "uk": "C10F",
        "us": "C10F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 5 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C10F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C10B",
        "name": "10-stitch cable back",
        "abbr": "C10B",
        "uk": "C10B",
        "us": "C10B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 5 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C10B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C12F",
        "name": "12-stitch cable front",
        "abbr": "C12F",
        "uk": "C12F",
        "us": "C12F",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 6 stitch(es) to front, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C12F"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "C12B",
        "name": "12-stitch cable back",
        "abbr": "C12B",
        "uk": "C12B",
        "us": "C12B",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold 6 stitch(es) to back, knit remaining then held stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "C12B"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "LT",
        "name": "Left twist",
        "abbr": "LT",
        "uk": "LT",
        "us": "LT",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Two-stitch left-leaning twist, often without cable needle.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "LT"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "RT",
        "name": "Right twist",
        "abbr": "RT",
        "uk": "RT",
        "us": "RT",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Two-stitch right-leaning twist, often without cable needle.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "RT"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "LPT",
        "name": "Left purl twist",
        "abbr": "LPT",
        "uk": "LPT",
        "us": "LPT",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Twist combining knit and purl stitches, leaning left.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "LPT"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "RPT",
        "name": "Right purl twist",
        "abbr": "RPT",
        "uk": "RPT",
        "us": "RPT",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Twist combining knit and purl stitches, leaning right.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "RPT"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "cn front",
        "name": "Cable needle front",
        "abbr": "cn front",
        "uk": "cn front",
        "us": "cn front",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold stitches on cable needle in front.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "cn front"
    },
    {
        "type": "knitting",
        "category": "Cable",
        "symbol": "cn back",
        "name": "Cable needle back",
        "abbr": "cn back",
        "uk": "cn back",
        "us": "cn back",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Hold stitches on cable needle at back.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "cn back"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "w&t",
        "name": "Wrap and turn",
        "abbr": "w&t",
        "uk": "w&t",
        "us": "w&t",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Wrap stitch and turn work for short-row shaping.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "w&t"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "DS",
        "name": "German short row double stitch",
        "abbr": "DS",
        "uk": "DS",
        "us": "DS",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Make a double stitch after turning.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "DS"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "J-SR",
        "name": "Japanese short row",
        "abbr": "J-SR",
        "uk": "J-SR",
        "us": "J-SR",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Short row using marker or loop to close gap.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "J-SR"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "SW",
        "name": "Shadow wrap",
        "abbr": "SW",
        "uk": "SW",
        "us": "SW",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Short-row method using lifted stitch wrap.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "SW"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "PU wrap",
        "name": "Pick up wrap",
        "abbr": "PU wrap",
        "uk": "PU wrap",
        "us": "PU wrap",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work wrap together with wrapped stitch.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "PU wrap"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "heel turn",
        "name": "Turn heel",
        "abbr": "heel turn",
        "uk": "heel turn",
        "us": "heel turn",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Short-row/decrease shaping for sock heels.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "heel turn"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "pu & k",
        "name": "Pick up and knit",
        "abbr": "pu & k",
        "uk": "pu & k",
        "us": "pu & k",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Pick up loops along edge and knit them.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "pu & k"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "pu & p",
        "name": "Pick up and purl",
        "abbr": "pu & p",
        "uk": "pu & p",
        "us": "pu & p",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Pick up loops along edge and purl them.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "pu & p"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "prov co",
        "name": "Provisional cast on",
        "abbr": "prov co",
        "uk": "prov co",
        "us": "prov co",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Temporary cast-on to release live stitches later.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "prov co"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "3NBO",
        "name": "Three-needle bind off",
        "abbr": "3NBO",
        "uk": "3NBO",
        "us": "3NBO",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Join two live edges while binding/casting off.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "3NBO"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "graft",
        "name": "Kitchener stitch",
        "abbr": "graft",
        "uk": "graft",
        "us": "graft",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Graft live stitches invisibly with yarn needle.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "graft"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "i-cord",
        "name": "I-cord",
        "abbr": "i-cord",
        "uk": "i-cord",
        "us": "i-cord",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Narrow knitted tube, often edging or drawstring.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "i-cord"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "applied i-cord",
        "name": "Applied I-cord",
        "abbr": "applied i-cord",
        "uk": "applied i-cord",
        "us": "applied i-cord",
        "alt": "",
        "difficulty": "Standard",
        "desc": "I-cord worked onto edge as finishing.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "applied i-co"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "steek",
        "name": "Steek",
        "abbr": "steek",
        "uk": "steek",
        "us": "steek",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Reinforced stitches cut open after colourwork.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "steek"
    },
    {
        "type": "knitting",
        "category": "Technique",
        "symbol": "lifeline",
        "name": "Lifeline",
        "abbr": "lifeline",
        "uk": "lifeline",
        "us": "lifeline",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Waste yarn threaded through row for recovery point.",
        "note": "",
        "source": "https://www.yarnspirations.com/en-row/blogs/how-to/understanding-knitting-abbreviations",
        "visual": "lifeline"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "O",
        "name": "Eyelet",
        "abbr": "O",
        "uk": "O",
        "us": "O",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Small hole, usually from yarn over plus decrease.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "O"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "yo twice",
        "name": "Double yarn over",
        "abbr": "yo twice",
        "uk": "yo twice",
        "us": "yo twice",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Two wraps creating larger eyelet.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "yo twice"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "nupp",
        "name": "Nupp",
        "abbr": "nupp",
        "uk": "nupp",
        "us": "nupp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Estonian bobble-like lace feature made from multiple loops.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "nupp"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "bob",
        "name": "Bobble",
        "abbr": "bob",
        "uk": "bob",
        "us": "bob",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised lump worked from and collapsed into one stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "bob"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "picot BO",
        "name": "Picot bind off",
        "abbr": "picot BO",
        "uk": "picot BO",
        "us": "picot BO",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decorative pointed cast/bind-off edge.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "picot BO"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "drop st",
        "name": "Drop stitch",
        "abbr": "drop st",
        "uk": "drop st",
        "us": "drop st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Drop stitch intentionally to create elongated texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "drop st"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "elong st",
        "name": "Elongated stitch",
        "abbr": "elong st",
        "uk": "elong st",
        "us": "elong st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Wrap yarn extra times then drop wraps next row.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "elong st"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "cl",
        "name": "Cluster stitch",
        "abbr": "cl",
        "uk": "cl",
        "us": "cl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Several stitches worked together for texture or lace.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "cl"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "smock",
        "name": "Smocking stitch",
        "abbr": "smock",
        "uk": "smock",
        "us": "smock",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Gathered stitches forming honeycomb texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "smock"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "star st",
        "name": "Star stitch",
        "abbr": "star st",
        "uk": "star st",
        "us": "star st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decorative textured star motif made by grouping stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "star st"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "trinity",
        "name": "Trinity stitch",
        "abbr": "trinity",
        "uk": "trinity",
        "us": "trinity",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised texture using increases/decreases over three stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "trinity"
    },
    {
        "type": "knitting",
        "category": "Lace/Decorative",
        "symbol": "clover",
        "name": "Cloverleaf eyelet",
        "abbr": "clover",
        "uk": "clover",
        "us": "clover",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Lace motif formed by grouped eyelets and decreases.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/knit-chart-symbols",
        "visual": "clover"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "ch",
        "name": "Chain",
        "abbr": "ch",
        "uk": "ch",
        "us": "ch",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Foundation loop/stitch used to start work or create spaces.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "oval"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "sl st",
        "name": "Slip stitch",
        "abbr": "sl st",
        "uk": "sl st",
        "us": "sl st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Small joining/moving stitch with minimal height.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "filled dot"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "dc",
        "name": "Double crochet (UK) / Single crochet (US)",
        "abbr": "dc",
        "uk": "dc",
        "us": "sc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Short dense stitch. UK dc equals US sc.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "x / +"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "htr",
        "name": "Half treble crochet (UK) / Half double crochet (US)",
        "abbr": "htr",
        "uk": "htr",
        "us": "hdc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Medium-height stitch. UK htr equals US hdc.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "T with bar"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "tr",
        "name": "Treble crochet (UK) / Double crochet (US)",
        "abbr": "tr",
        "uk": "tr",
        "us": "dc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Common taller stitch. UK tr equals US dc.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "T with one s"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "dtr",
        "name": "Double treble crochet (UK) / Treble crochet (US)",
        "abbr": "dtr",
        "uk": "dtr",
        "us": "tr",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Tall stitch. UK dtr equals US tr.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "T with two s"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "trtr",
        "name": "Triple treble crochet (UK) / Double treble crochet (US)",
        "abbr": "trtr",
        "uk": "trtr",
        "us": "dtr",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Extra-tall stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "T with three"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "qtr",
        "name": "Quadruple treble crochet",
        "abbr": "qtr",
        "uk": "qtr",
        "us": "trtr",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Very tall stitch with multiple yarnovers.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "T with four "
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "qnttr",
        "name": "Quintuple treble crochet",
        "abbr": "qnttr",
        "uk": "qnttr",
        "us": "qtr",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Extremely tall decorative stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "T with five "
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "yrh / yoh",
        "name": "Yarn over",
        "abbr": "yrh / yoh",
        "uk": "yrh / yoh",
        "us": "yo",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Wrap yarn over hook.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "yo"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "yrh",
        "name": "Yarn round hook",
        "abbr": "yrh",
        "uk": "yrh",
        "us": "yo",
        "alt": "",
        "difficulty": "Standard",
        "desc": "UK wording for yarn over hook.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "yrh"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "turn",
        "name": "Turn",
        "abbr": "turn",
        "uk": "turn",
        "us": "turn",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Turn work to begin next row.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "turn"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "fasten off",
        "name": "Fasten off",
        "abbr": "fasten off",
        "uk": "fasten off",
        "us": "fasten off",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Secure final loop and end working yarn.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "FO"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "join",
        "name": "Join with slip stitch",
        "abbr": "join",
        "uk": "join",
        "us": "join",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Close round or attach yarn with slip stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "join"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "sp",
        "name": "Space",
        "abbr": "sp",
        "uk": "sp",
        "us": "sp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Gap created by chain(s) or previous stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "sp"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "ch-sp",
        "name": "Chain space",
        "abbr": "ch-sp",
        "uk": "ch-sp",
        "us": "ch-sp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Space formed by one or more chains.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "ch-sp"
    },
    {
        "type": "crochet",
        "category": "Basic",
        "symbol": "pm/sm",
        "name": "Stitch marker",
        "abbr": "pm/sm",
        "uk": "pm/sm",
        "us": "pm/sm",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Place or slip marker to track position.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "PM/SM"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "flo",
        "name": "Front loop only",
        "abbr": "flo",
        "uk": "flo",
        "us": "flo",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work through front loop only.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "FLO"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "blo",
        "name": "Back loop only",
        "abbr": "blo",
        "uk": "blo",
        "us": "blo",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work through back loop only.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "BLO"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "both loops",
        "name": "Both loops",
        "abbr": "both loops",
        "uk": "both loops",
        "us": "both loops",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work under both top loops.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "both loops"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "3rd loop",
        "name": "Third loop",
        "abbr": "3rd loop",
        "uk": "3rd loop",
        "us": "3rd loop",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work into horizontal back bar/third loop, often in htr/hdc.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "3rd loop"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "back bump",
        "name": "Back bump of chain",
        "abbr": "back bump",
        "uk": "back bump",
        "us": "back bump",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work into underside bump of foundation chain.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "back bump"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "fpdc",
        "name": "Front post double crochet UK / single crochet US",
        "abbr": "fpdc",
        "uk": "fpdc",
        "us": "fpsc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work UK dc/US sc around front post.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "FPdc/FPSC"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "bpdc",
        "name": "Back post double crochet UK / single crochet US",
        "abbr": "bpdc",
        "uk": "bpdc",
        "us": "bpsc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work UK dc/US sc around back post.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "BPdc/BPSC"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "fptr",
        "name": "Front post treble UK / double US",
        "abbr": "fptr",
        "uk": "fptr",
        "us": "fpdc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised front-post tall stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "FPtr/FPdc"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "bptr",
        "name": "Back post treble UK / double US",
        "abbr": "bptr",
        "uk": "bptr",
        "us": "bpdc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised back-post tall stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "BPtr/BPdc"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "fpdtr",
        "name": "Front post double treble UK / treble US",
        "abbr": "fpdtr",
        "uk": "fpdtr",
        "us": "fptr",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Tall raised front-post stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "FPdtr/FPtr"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "bpdtr",
        "name": "Back post double treble UK / treble US",
        "abbr": "bpdtr",
        "uk": "bpdtr",
        "us": "bptr",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Tall raised back-post stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "BPdtr/BPtr"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "relief st",
        "name": "Relief stitch",
        "abbr": "relief st",
        "uk": "relief st",
        "us": "post st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Textured stitch worked around post rather than top loops.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "post"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "spike st",
        "name": "Spike stitch",
        "abbr": "spike st",
        "uk": "spike st",
        "us": "spike st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Long stitch inserted into rows below.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "long stitch"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "long dc",
        "name": "Long double crochet UK / long single US",
        "abbr": "long dc",
        "uk": "long dc",
        "us": "long sc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Extended downward stitch into lower row.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "long dc/long"
    },
    {
        "type": "crochet",
        "category": "Position/Post/Loop",
        "symbol": "camel st",
        "name": "Camel stitch",
        "abbr": "camel st",
        "uk": "camel st",
        "us": "camel st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Ribbed effect made by working into third loop.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "3rd loop"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "inc / 2 sts in next st",
        "name": "Increase",
        "abbr": "inc / 2 sts in next st",
        "uk": "inc / 2 sts in next st",
        "us": "inc / 2 sts in next st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Work two or more stitches into one stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "V"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "inv inc",
        "name": "Invisible increase",
        "abbr": "inv inc",
        "uk": "inv inc",
        "us": "inv inc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Increase placed to minimise visible gap.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "V hidden"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "dec",
        "name": "Decrease",
        "abbr": "dec",
        "uk": "dec",
        "us": "dec",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Combine two or more stitches into one.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "Λ"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "inv dec",
        "name": "Invisible decrease",
        "abbr": "inv dec",
        "uk": "inv dec",
        "us": "inv dec",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decrease through front loops for a neater amigurumi finish.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "inv dec"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "dc2tog",
        "name": "Double crochet two together UK / single crochet two together US",
        "abbr": "dc2tog",
        "uk": "dc2tog",
        "us": "sc2tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decrease over two short stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "dc2tog/sc2to"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "htr2tog",
        "name": "Half treble two together UK / hdc two together US",
        "abbr": "htr2tog",
        "uk": "htr2tog",
        "us": "hdc2tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decrease over two medium-height stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "htr2tog/hdc2"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "tr2tog",
        "name": "Treble two together UK / double crochet two together US",
        "abbr": "tr2tog",
        "uk": "tr2tog",
        "us": "dc2tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decrease over two tall stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "tr2tog/dc2to"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "dtr2tog",
        "name": "Double treble two together UK / treble two together US",
        "abbr": "dtr2tog",
        "uk": "dtr2tog",
        "us": "tr2tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decrease over two tall stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "dtr2tog/tr2t"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "3tog",
        "name": "Three stitches together",
        "abbr": "3tog",
        "uk": "3tog",
        "us": "3tog",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decrease over three stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "3tog"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "2 in st",
        "name": "Two stitches in same stitch",
        "abbr": "2 in st",
        "uk": "2 in st",
        "us": "2 in st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Simple increase wording.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "2 in st"
    },
    {
        "type": "crochet",
        "category": "Increase/Decrease",
        "symbol": "work even",
        "name": "Work even",
        "abbr": "work even",
        "uk": "work even",
        "us": "work even",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Continue without increasing or decreasing.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "even"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "cl",
        "name": "Cluster stitch",
        "abbr": "cl",
        "uk": "cl",
        "us": "cl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Group of partial stitches closed together.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "CL"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "2tr cl",
        "name": "2-treble cluster UK / 2-double cluster US",
        "abbr": "2tr cl",
        "uk": "2tr cl",
        "us": "2dc cl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Cluster made from two tall partial stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "2tr cl / 2dc"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "3tr cl",
        "name": "3-treble cluster UK / 3-double cluster US",
        "abbr": "3tr cl",
        "uk": "3tr cl",
        "us": "3dc cl",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Cluster made from three tall partial stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "3tr cl / 3dc"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "puff st",
        "name": "Puff stitch",
        "abbr": "puff st",
        "uk": "puff st",
        "us": "puff st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Several pulled-up loops closed together for soft texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "puff"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "bobble",
        "name": "Bobble stitch",
        "abbr": "bobble",
        "uk": "bobble",
        "us": "bobble",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised bobble formed from several partial stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "bobble"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "pc",
        "name": "Popcorn stitch",
        "abbr": "pc",
        "uk": "pc",
        "us": "pc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Several completed stitches joined to pop forward.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "popcorn"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "shell",
        "name": "Shell stitch",
        "abbr": "shell",
        "uk": "shell",
        "us": "shell",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Multiple stitches worked in same space creating a fan.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "shell"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "fan",
        "name": "Fan stitch",
        "abbr": "fan",
        "uk": "fan",
        "us": "fan",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Open shell-like group, often lace style.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "fan"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "v-st",
        "name": "V-stitch",
        "abbr": "v-st",
        "uk": "v-st",
        "us": "v-st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Two tall stitches separated by chain in same space.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "V"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "crossed st",
        "name": "Crossed stitch",
        "abbr": "crossed st",
        "uk": "crossed st",
        "us": "crossed st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Stitches worked out of order to cross.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "X"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "cable st",
        "name": "Cable crochet stitch",
        "abbr": "cable st",
        "uk": "cable st",
        "us": "cable st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Texture mimicking knitted cables, often with post stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "cable"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "waffle st",
        "name": "Waffle stitch",
        "abbr": "waffle st",
        "uk": "waffle st",
        "us": "waffle st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised grid using post stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "waffle"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "basketweave",
        "name": "Basketweave crochet",
        "abbr": "basketweave",
        "uk": "basketweave",
        "us": "basketweave",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Blocks of front/back post stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "basket"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "rib st",
        "name": "Rib stitch",
        "abbr": "rib st",
        "uk": "rib st",
        "us": "rib st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Elastic-looking ribs, usually BLO or post stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "rib"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "moss st / linen st",
        "name": "Moss stitch / Linen stitch",
        "abbr": "moss st / linen st",
        "uk": "moss st / linen st",
        "us": "moss st / linen st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternating short stitches and chains for woven texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "moss/linen"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "granite st",
        "name": "Granite stitch",
        "abbr": "granite st",
        "uk": "granite st",
        "us": "granite st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Another name/variant for moss or linen stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "granite"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "suzette st",
        "name": "Suzette stitch",
        "abbr": "suzette st",
        "uk": "suzette st",
        "us": "suzette st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Combination of short and tall stitches in same stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "suzette"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "lemon peel",
        "name": "Lemon peel stitch",
        "abbr": "lemon peel",
        "uk": "lemon peel",
        "us": "lemon peel",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternating short and tall stitches for pebbled texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "lemon peel"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "grit st",
        "name": "Grit stitch",
        "abbr": "grit st",
        "uk": "grit st",
        "us": "grit st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Dense texture combining short/tall stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "grit"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "seed st",
        "name": "Seed stitch crochet",
        "abbr": "seed st",
        "uk": "seed st",
        "us": "seed st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Textured alternating stitch pattern.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "seed"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "star st",
        "name": "Star stitch",
        "abbr": "star st",
        "uk": "star st",
        "us": "star st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Rows of clustered spikes forming star shapes.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "star"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "marguerite",
        "name": "Marguerite stitch",
        "abbr": "marguerite",
        "uk": "marguerite",
        "us": "marguerite",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Another name/variant for star stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "marguerite"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "jasmine st",
        "name": "Jasmine stitch",
        "abbr": "jasmine st",
        "uk": "jasmine st",
        "us": "jasmine st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Puff-stitch flower texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "jasmine"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "crocodile st",
        "name": "Crocodile stitch",
        "abbr": "crocodile st",
        "uk": "crocodile st",
        "us": "crocodile st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Layered scale texture worked around V-stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "scale"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "dragon scale",
        "name": "Dragon scale stitch",
        "abbr": "dragon scale",
        "uk": "dragon scale",
        "us": "dragon scale",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Scale-like stitch family related to crocodile stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "scale"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "Apache tears",
        "name": "Apache tears",
        "abbr": "Apache tears",
        "uk": "Apache tears",
        "us": "Apache tears",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Colourwork texture using spike stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "spike rows"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "brick st",
        "name": "Brick stitch",
        "abbr": "brick st",
        "uk": "brick st",
        "us": "brick st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Offset stitch pattern resembling brickwork.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "brick"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "block st",
        "name": "Block stitch",
        "abbr": "block st",
        "uk": "block st",
        "us": "block st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Colour-blocked stitch using groups and chains.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "block"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "arcade st",
        "name": "Arcade stitch",
        "abbr": "arcade st",
        "uk": "arcade st",
        "us": "arcade st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Lacy arches resembling arcades.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "arcade"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "Catherine wheel",
        "name": "Catherine wheel",
        "abbr": "Catherine wheel",
        "uk": "Catherine wheel",
        "us": "Catherine wheel",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Circular fan motifs arranged in rows.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "wheel"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "harlequin",
        "name": "Harlequin stitch",
        "abbr": "harlequin",
        "uk": "harlequin",
        "us": "harlequin",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Diamond/fan pattern similar to Catherine wheel.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "harlequin"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "larksfoot",
        "name": "Larksfoot stitch",
        "abbr": "larksfoot",
        "uk": "larksfoot",
        "us": "larksfoot",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Colourwork stitch with long dropped stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "larksfoot"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "cobble st",
        "name": "Aligned cobble stitch",
        "abbr": "cobble st",
        "uk": "cobble st",
        "us": "cobble st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised cobbled texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "cobble"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "sedge st",
        "name": "Sedge stitch",
        "abbr": "sedge st",
        "uk": "sedge st",
        "us": "sedge st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Textured stitch using combinations in one stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "sedge"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "wattle st",
        "name": "Wattle stitch",
        "abbr": "wattle st",
        "uk": "wattle st",
        "us": "wattle st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Combination stitch with chain spaces.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "wattle"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "trinity st",
        "name": "Trinity stitch crochet",
        "abbr": "trinity st",
        "uk": "trinity st",
        "us": "trinity st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Clustered texture resembling small stars.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "trinity"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "Elizabeth st",
        "name": "Elizabeth stitch / Mini bean",
        "abbr": "Elizabeth st",
        "uk": "Elizabeth st",
        "us": "mini bean st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Small puff-like stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "bean"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "bean st",
        "name": "Bean stitch",
        "abbr": "bean st",
        "uk": "bean st",
        "us": "bean st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Dense puff/bean texture.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "bean"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "alpine st",
        "name": "Alpine stitch",
        "abbr": "alpine st",
        "uk": "alpine st",
        "us": "alpine st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternating tall stitches and front-post stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "alpine"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "thermal st",
        "name": "Thermal stitch",
        "abbr": "thermal st",
        "uk": "thermal st",
        "us": "thermal st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Very thick fabric worked through loops from current and previous rows.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "thermal"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "knit st / waistcoat",
        "name": "Waistcoat stitch",
        "abbr": "knit st / waistcoat",
        "uk": "knit st / waistcoat",
        "us": "waistcoat st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Short stitch worked into centre V to mimic knitting.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "V"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "tapestry crochet",
        "name": "Tapestry crochet stitch",
        "abbr": "tapestry crochet",
        "uk": "tapestry crochet",
        "us": "tapestry crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Colourwork carrying unused yarn inside stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "colour grid"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "Fair Isle crochet",
        "name": "Fair Isle crochet",
        "abbr": "Fair Isle crochet",
        "uk": "Fair Isle crochet",
        "us": "Fair Isle crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Colourwork crochet inspired by knitting charts.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "colour grid"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "overlay crochet",
        "name": "Overlay crochet",
        "abbr": "overlay crochet",
        "uk": "overlay crochet",
        "us": "overlay crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decorative stitches layered over background.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "overlay"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "mosaic crochet",
        "name": "Mosaic crochet",
        "abbr": "mosaic crochet",
        "uk": "mosaic crochet",
        "us": "mosaic crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Colourwork using chains, drops and overlay stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "mosaic"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "interlocking crochet",
        "name": "Interlocking crochet",
        "abbr": "interlocking crochet",
        "uk": "interlocking crochet",
        "us": "interlocking crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Two mesh layers worked together for reversible colourwork.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "interlock"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "Bavarian crochet",
        "name": "Bavarian crochet",
        "abbr": "Bavarian crochet",
        "uk": "Bavarian crochet",
        "us": "Bavarian crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Textured square/round stitch with raised colourwork.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "bavarian"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "c2c",
        "name": "Corner to corner",
        "abbr": "c2c",
        "uk": "c2c",
        "us": "c2c",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Diagonal block construction, often using chains and trebles/doubles.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "C2C"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "granny cluster",
        "name": "Granny cluster",
        "abbr": "granny cluster",
        "uk": "granny cluster",
        "us": "granny cluster",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Classic group of three tall stitches, usually in chain spaces.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "granny"
    },
    {
        "type": "crochet",
        "category": "Texture/Pattern",
        "symbol": "granny square",
        "name": "Granny square",
        "abbr": "granny square",
        "uk": "granny square",
        "us": "granny square",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Motif built in rounds using granny clusters.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "granny sq"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "picot",
        "name": "Picot",
        "abbr": "picot",
        "uk": "picot",
        "us": "picot",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Small loop used as decorative edging.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "picot"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "picot trefoil",
        "name": "Picot trefoil",
        "abbr": "picot trefoil",
        "uk": "picot trefoil",
        "us": "picot trefoil",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Three picots grouped like a clover.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "picot x3"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "pineapple",
        "name": "Pineapple stitch",
        "abbr": "pineapple",
        "uk": "pineapple",
        "us": "pineapple",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Lace motif shaped like a pineapple.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "pineapple"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "Solomon’s knot",
        "name": "Solomon’s knot / Lover’s knot",
        "abbr": "Solomon’s knot",
        "uk": "Solomon’s knot",
        "us": "Solomon’s knot",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Open lace made from elongated loops and knots.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "long loop"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "broomstick lace",
        "name": "Broomstick lace",
        "abbr": "broomstick lace",
        "uk": "broomstick lace",
        "us": "broomstick lace",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Large loops held on dowel/needle then grouped.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "broomstick"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "hairpin lace",
        "name": "Hairpin lace",
        "abbr": "hairpin lace",
        "uk": "hairpin lace",
        "us": "hairpin lace",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Strips made on hairpin loom and joined.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "hairpin"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "filet crochet",
        "name": "Filet crochet",
        "abbr": "filet crochet",
        "uk": "filet crochet",
        "us": "filet crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Open/filled mesh squares forming motifs.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "grid"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "mesh st",
        "name": "Mesh stitch",
        "abbr": "mesh st",
        "uk": "mesh st",
        "us": "mesh st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Open fabric made from chains and stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "mesh"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "diamond mesh",
        "name": "Diamond mesh",
        "abbr": "diamond mesh",
        "uk": "diamond mesh",
        "us": "diamond mesh",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Mesh arranged into diamond shapes.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "diamond"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "net st",
        "name": "Net stitch",
        "abbr": "net st",
        "uk": "net st",
        "us": "net st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Open net-like fabric.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "net"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "Irish crochet",
        "name": "Irish crochet motif",
        "abbr": "Irish crochet",
        "uk": "Irish crochet",
        "us": "Irish crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Raised motifs traditionally joined with mesh.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "motif"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "bullion st",
        "name": "Bullion stitch",
        "abbr": "bullion st",
        "uk": "bullion st",
        "us": "bullion st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Wrapped stitch forming a coil.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "bullion"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "roll st",
        "name": "Roll stitch",
        "abbr": "roll st",
        "uk": "roll st",
        "us": "roll st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Another name/family for bullion-style wraps.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "roll"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "crab st / reverse dc",
        "name": "Crab stitch / Reverse double crochet UK / reverse single US",
        "abbr": "crab st / reverse dc",
        "uk": "crab st / reverse dc",
        "us": "crab st / reverse sc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Edging worked backwards for corded finish.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "reverse"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "reverse tr",
        "name": "Reverse treble",
        "abbr": "reverse tr",
        "uk": "reverse tr",
        "us": "reverse dc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Tall reverse-direction edging stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "reverse tr"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "shell edging",
        "name": "Shell edging",
        "abbr": "shell edging",
        "uk": "shell edging",
        "us": "shell edging",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decorative border made from shells.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "shell edge"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "scallop edging",
        "name": "Scallop edging",
        "abbr": "scallop edging",
        "uk": "scallop edging",
        "us": "scallop edging",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Rounded shell-like border.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "scallop"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "fringe",
        "name": "Fringe",
        "abbr": "fringe",
        "uk": "fringe",
        "us": "fringe",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Cut yarn strands attached as border.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "fringe"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "surface sl st",
        "name": "Surface slip stitch",
        "abbr": "surface sl st",
        "uk": "surface sl st",
        "us": "surface sl st",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Decorative slip stitches worked on fabric surface.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "surface sl s"
    },
    {
        "type": "crochet",
        "category": "Lace/Edging/Motif",
        "symbol": "surface crochet",
        "name": "Surface crochet",
        "abbr": "surface crochet",
        "uk": "surface crochet",
        "us": "surface crochet",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Embroidery-like crochet worked over existing fabric.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-chart-symbols",
        "visual": "surface"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "tss",
        "name": "Tunisian simple stitch",
        "abbr": "tss",
        "uk": "tss",
        "us": "tss",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Basic Tunisian stitch worked under vertical bar.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "TSS"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "tks",
        "name": "Tunisian knit stitch",
        "abbr": "tks",
        "uk": "tks",
        "us": "tks",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Tunisian stitch inserted between bars to mimic knitting.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "TKS"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "tps",
        "name": "Tunisian purl stitch",
        "abbr": "tps",
        "uk": "tps",
        "us": "tps",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Tunisian stitch with yarn forward, purl-like bump.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "TPS"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "trs",
        "name": "Tunisian reverse stitch",
        "abbr": "trs",
        "uk": "trs",
        "us": "trs",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Worked into back vertical bar.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "TRS"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "tfs",
        "name": "Tunisian full stitch",
        "abbr": "tfs",
        "uk": "tfs",
        "us": "tfs",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Worked into spaces between stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "TFS"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "tes",
        "name": "Tunisian extended stitch",
        "abbr": "tes",
        "uk": "tes",
        "us": "tes",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Tunisian stitch with extra chain for height.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "TES"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "tdc",
        "name": "Tunisian double crochet UK / single?",
        "abbr": "tdc",
        "uk": "tdc",
        "us": "tsc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Short Tunisian variation; terminology varies.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "Tdc/Tsc"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "ttr",
        "name": "Tunisian treble UK / double US",
        "abbr": "ttr",
        "uk": "ttr",
        "us": "tdc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Taller Tunisian stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "Ttr/Tdc"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "honeycomb",
        "name": "Tunisian honeycomb stitch",
        "abbr": "honeycomb",
        "uk": "honeycomb",
        "us": "honeycomb",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternates simple and purl Tunisian stitches.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "honeycomb"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "entrelac",
        "name": "Tunisian entrelac",
        "abbr": "entrelac",
        "uk": "entrelac",
        "us": "entrelac",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Modular Tunisian squares/diamonds.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "entrelac"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "retp",
        "name": "Tunisian return pass",
        "abbr": "retp",
        "uk": "retp",
        "us": "retp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Standard return pass that completes Tunisian row.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "RetP"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "fwp",
        "name": "Tunisian forward pass",
        "abbr": "fwp",
        "uk": "fwp",
        "us": "fwp",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Forward pass collecting loops on hook.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "FwP"
    },
    {
        "type": "crochet",
        "category": "Tunisian",
        "symbol": "bind off",
        "name": "Tunisian bind off",
        "abbr": "bind off",
        "uk": "bind off",
        "us": "bind off",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Finish Tunisian row by slip-stitching across.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "bind off"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "MR",
        "name": "Magic ring / magic circle",
        "abbr": "MR",
        "uk": "MR",
        "us": "MR",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Adjustable loop for working in the round.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "MR"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "AR",
        "name": "Adjustable ring",
        "abbr": "AR",
        "uk": "AR",
        "us": "AR",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Alternative wording for magic ring.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "AR"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "fdc/fsc",
        "name": "Foundation double crochet UK / single US",
        "abbr": "fdc/fsc",
        "uk": "fdc/fsc",
        "us": "fdc/fsc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Foundation chain and first row of short stitches made together.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "fdc/fsc"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "fhtr/fhdc",
        "name": "Foundation half treble UK / hdc US",
        "abbr": "fhtr/fhdc",
        "uk": "fhtr/fhdc",
        "us": "fhtr/fhdc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Foundation chain and medium-height stitches made together.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "fhtr/fhdc"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "ftr/fdc",
        "name": "Foundation treble UK / double US",
        "abbr": "ftr/fdc",
        "uk": "ftr/fdc",
        "us": "ftr/fdc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Foundation chain and tall stitches made together.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "ftr/fdc"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "standing dc/sc",
        "name": "Standing double crochet UK / single US",
        "abbr": "standing dc/sc",
        "uk": "standing dc/sc",
        "us": "standing dc/sc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Join yarn with a stitch that replaces chain start.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "standing dc/"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "standing tr/dc",
        "name": "Standing treble UK / double US",
        "abbr": "standing tr/dc",
        "uk": "standing tr/dc",
        "us": "standing tr/dc",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Standing tall stitch used to start a round cleanly.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "standing tr/"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "beg ch",
        "name": "Beginning chain",
        "abbr": "beg ch",
        "uk": "beg ch",
        "us": "beg ch",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Chains used to start row/round.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "beg ch"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "t-ch",
        "name": "Turning chain",
        "abbr": "t-ch",
        "uk": "t-ch",
        "us": "t-ch",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Chains made before turning to next row.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "t-ch"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "JAYG",
        "name": "Join as you go",
        "abbr": "JAYG",
        "uk": "JAYG",
        "us": "JAYG",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Join motifs while crocheting final round.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "JAYG"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "spiral",
        "name": "Continuous rounds",
        "abbr": "spiral",
        "uk": "spiral",
        "us": "spiral",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Rounds worked without joining.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "spiral"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "joined rnds",
        "name": "Joined rounds",
        "abbr": "joined rnds",
        "uk": "joined rnds",
        "us": "joined rnds",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Rounds closed with slip stitch.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "joined rnds"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "ami",
        "name": "Amigurumi",
        "abbr": "ami",
        "uk": "ami",
        "us": "ami",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Small stuffed crochet, often worked in spirals.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "ami"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "FRJ",
        "name": "Front ridge join",
        "abbr": "FRJ",
        "uk": "FRJ",
        "us": "FRJ",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Join using front ridge/loops for decorative seam.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "FRJ"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "mattress",
        "name": "Mattress stitch seam",
        "abbr": "mattress",
        "uk": "mattress",
        "us": "mattress",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Sewn seam for joining crochet pieces.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "mattress"
    },
    {
        "type": "crochet",
        "category": "Construction/Technique",
        "symbol": "whip",
        "name": "Whip stitch seam",
        "abbr": "whip",
        "uk": "whip",
        "us": "whip",
        "alt": "",
        "difficulty": "Standard",
        "desc": "Simple sewn seam through edges.",
        "note": "",
        "source": "https://www.craftyarncouncil.com/standards/crochet-abbreviations",
        "visual": "whip"
    }
];

	  const stitchNameIndex = (function() {
	    const index = {};
	    function addAlias(alias, item, overwrite) {
	      alias = String(alias || '').toLowerCase().trim();
	      if (!alias) return;
	      if (!overwrite && index[alias]) return;
	      index[alias] = item;
	    }
	    stitchItems.forEach(function(item) {
	      var name = String(item.name || '').trim();
	      if (!name) return;
	      addAlias(name, item, true);
	      name.split('/').forEach(function(part) {
	        addAlias(part.replace(/\([^)]*\)/g, '').trim(), item, false);
	      });
	      if (item.abbr) addAlias(item.abbr, item, false);
	      if (item.symbol) addAlias(item.symbol, item, false);
	      if (item.uk) addAlias(item.uk, item, false);
	      if (item.us) addAlias(item.us, item, false);
	      if (item.alt) {
	        String(item.alt).split(',').forEach(function(a) {
	          addAlias(a, item, false);
	        });
	      }
	      if (item.visual && item.visual.indexOf('/') === -1) {
	        addAlias(item.visual, item, false);
	      }
	    });
	    return index;
	  })();

  function findStitchItem(text) {
    var lower = String(text || '').toLowerCase().trim();
    if (stitchNameIndex[lower]) return stitchNameIndex[lower];
    for (var name in stitchNameIndex) {
      if (stitchNameIndex.hasOwnProperty(name) && name.indexOf(lower) !== -1) return stitchNameIndex[name];
    }
    return undefined;
  }

  function injectStitchRefs(html) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    highlightTextNodes(wrapper);
    return wrapper.innerHTML;
  }

  function highlightTextNodes(node) {
    if (node.nodeType === 3) {
      var text = node.textContent;
      if (!text.trim()) return;

      var names = Object.keys(stitchNameIndex).sort(function(a,b){ return b.length - a.length; });
      var matches = [];

	      var shortAllowed = {
	        ch: true, dc: true, sc: true, tr: true, yo: true
	      };
	      names.forEach(function(name) {
	        if (name.length <= 2 && !shortAllowed[name]) return;
        var escaped = escapeRegexChars(name);
        var regex;
        try {
          regex = new RegExp('(?:^|\\s|[.,;:!?()\\[\\]{}\\-\\u2013\\u2014])(' + escaped + ')(?=\\s|[.,;:!?()\\[\\]{}\\-\\u2013\\u2014]|$)', 'gi');
        } catch(e) { return; }
        var match;
        regex.lastIndex = 0;
        while ((match = regex.exec(text)) !== null) {
          var idx = match.index + match[0].indexOf(match[1]);
          matches.push({ index: idx, length: match[1].length, item: stitchNameIndex[name] });
        }
      });

      if (!matches.length) return;

      matches.sort(function(a,b){ return a.index - b.index; });

      var deduped = [];
      matches.forEach(function(m) {
        var prev = deduped[deduped.length - 1];
        if (!prev || (m.index >= prev.index + prev.length)) {
          deduped.push(m);
        }
      });

      if (!deduped.length) return;

      var fragment = document.createDocumentFragment();
      var currentIndex = 0;
      deduped.forEach(function(m) {
        if (m.index > currentIndex) {
          fragment.appendChild(document.createTextNode(text.substring(currentIndex, m.index)));
        }
        var span = document.createElement('span');
        span.className = 'ss-stitch-ref';
        span.setAttribute('data-ss-stitch', m.item.name);
        span.textContent = text.substring(m.index, m.index + m.length);
        fragment.appendChild(span);
        currentIndex = m.index + m.length;
      });

      if (currentIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(currentIndex)));
      }

      if (fragment.childNodes.length > 0 && node.parentNode) {
        node.parentNode.replaceChild(fragment, node);
      }
      return;
    }

    if (node.nodeType === 1) {
      if (node.classList && node.classList.contains('ss-stitch-ref')) return;
      var tag = (node.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'code' || tag === 'pre' || tag === 'svg') return;
      var children = Array.prototype.slice.call(node.childNodes);
      children.forEach(function(child) {
        highlightTextNodes(child);
      });
    }
  }

  function escapeRegexChars(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildStitchTooltipHtml(item) {
    var mark = item.symbol || item.abbr || item.visual || '•';
    var askPrompt = 'This is a general Stitch Dictionary question, not a question about the uploaded pattern. Please explain how to create the ' + (item.name || mark) + ' ' + (item.type || '') + ' stitch in clear, detailed, step-by-step UK English. Include what the abbreviation means, when it is used, and any beginner tips. UK/EU term: ' + (item.uk || 'not listed') + '. US term: ' + (item.us || 'not listed') + '.';
    return '<div class="ss-stitch-tooltip-card">' +
      '<div class="ss-dict-card-top">' +
        '<span class="ss-stitch-lozenge" title="Stitch abbreviation">' + escapeHtml(mark) + '</span>' +
      '</div>' +
      '<div class="ss-dict-title"><b>' + escapeHtml(item.name) + '</b><span>' + escapeHtml(item.desc || 'No description available yet.') + '</span></div>' +
      '<div class="ss-dict-facts">' +
        (item.uk ? '<div data-fact="uk"><i>🇬🇧</i><strong>UK/EU:</strong><span>' + escapeHtml(item.uk) + '</span></div>' : '') +
        (item.us ? '<div data-fact="us"><i>🇺🇸</i><strong>US:</strong><span>' + escapeHtml(item.us) + '</span></div>' : '') +
        '<div data-fact="difficulty"><i>🟢</i><strong>Difficulty:</strong><span>' + escapeHtml(item.difficulty || 'Standard') + '</span></div>' +
      '</div>' +
      '<button type="button" class="ss-dict-ask ss-tooltip-ask" data-ss-stitch-ask="' + escapeHtml(askPrompt) + '">ASK?</button>' +
    '</div>';
  }

  const gaugeItems = [
    ['2.00 mm', 'US 0', 'Fine socks and laceweight work'],
    ['2.25 mm', 'US 1', 'Socks and fine 4 ply projects'],
    ['2.75 mm', 'US 2', 'Light 4 ply and baby garments'],
    ['3.25 mm', 'US 3', '4 ply and sportweight projects'],
    ['3.50 mm', 'US 4', 'Light DK projects'],
    ['4.00 mm', 'US 6', 'Standard DK yarn favourite'],
    ['4.50 mm', 'US 7', 'DK to light aran'],
    ['5.00 mm', 'US 8', 'Aran and medium-weight projects'],
    ['5.50 mm', 'US 9', 'Aran and textured fabrics'],
    ['6.00 mm', 'US 10', 'Chunky yarns'],
    ['8.00 mm', 'US 11', 'Chunky and super chunky'],
    ['10.00 mm', 'US 15', 'Super chunky quick makes']
  ];

  const defaultQuickStarts = [
    'Explain this pattern instruction in plain English.',
    'Help me check my tension using centimetres.',
    'My stitch count is wrong. How do I troubleshoot it?',
    'How do I substitute yarn without changing the finished size?',
    'Convert this US crochet terminology into UK terms.',
    'What needle or hook size should I try for this yarn?',
    'Help me resize this pattern for a different chest measurement.',
    'Why is my knitting curling and how do I fix it?',
    'How do I fix a dropped stitch?',
    'How do I avoid gaps when changing colour?',
    'How do I block this project properly?',
    'Help me understand yarn weight and metres.'
  ];

  const crochetConversions = [
    ['UK dc', 'US sc', 'Double crochet / single crochet'],
    ['UK htr', 'US hdc', 'Half treble / half double'],
    ['UK tr', 'US dc', 'Treble / double crochet'],
    ['UK dtr', 'US tr', 'Double treble / treble'],
    ['UK tension', 'US gauge', 'Same idea, different wording']
  ];

  function qs(root, selector) { return root.querySelector(selector); }
  function qsa(root, selector) { return Array.prototype.slice.call(root.querySelectorAll(selector)); }

  const ssIconPaths = {
    tools: '<path d="M14.7 6.3a1 1 0 0 0-1.4 0l-7 7a1 1 0 0 0 0 1.4l3 3a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4z"></path><path d="M8 8l8 8"></path><path d="M14 4l6 6"></path>',
    chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>',
    rework: '<path d="M4 4v6h6"></path><path d="M20 20v-6h-6"></path><path d="M20 9A8 8 0 0 0 6.4 5.4L4 8"></path><path d="M4 15a8 8 0 0 0 13.6 3.6L20 16"></path>',
    library: '<path d="M4 19.5V5a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v15H6a2 2 0 0 1-2-1.5z"></path><path d="M8 7h8"></path><path d="M8 11h8"></path>',
    dictionary: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path>',
    gauge: '<path d="M3 8h18"></path><path d="M7 8v8"></path><path d="M17 8v8"></path><path d="M5 16h14"></path>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>'
  };

  function ssIconSvg(name) {
    const paths = ssIconPaths[name] || ssIconPaths.tools;
    return '<span class="ss-ui-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' + paths + '</svg></span>';
  }

  function enhanceIconControls(root) {
    qsa(root, '[data-ss-tab]').forEach(function(button) {
      if (button.getAttribute('data-ss-icon-enhanced') === '1') return;
      var tab = button.getAttribute('data-ss-tab') || 'tools';
      var label = button.textContent.trim();
      button.innerHTML = ssIconSvg(tab) + '<span class="ss-btn-text">' + escapeHtml(label) + '</span>';
      button.setAttribute('data-ss-icon-enhanced', '1');
      if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
      button.classList.add('ss-has-icon');
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function stripAiMarkup(value) {
    return String(value || '')
      .replace(/\\text\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\mathbf\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\\((.*?)\\\)/gs, '$1')
      .replace(/\\\[(.*?)\\\]/gs, '$1')
      .replace(/\$\$(.*?)\$\$/gs, '$1')
      .replace(/\$(.*?)\$/g, '$1')
      .replace(/\\(?:text|mathrm|mathbf|emph|strong)\b/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\\*/g, '*')
      .replace(/\\_/g, '_')
      .replace(/[{}]/g, '')
      .trim();
  }

  function allowSafeAssistantHtml(html) {
    return String(html || '')
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
      .replace(/&lt;\/?b&gt;/gi, function (tag) { return tag.replace(/&lt;/g, '<').replace(/&gt;/g, '>'); })
      .replace(/&lt;\/?strong&gt;/gi, function (tag) { return tag.toLowerCase().includes('/') ? '</b>' : '<b>'; })
      .replace(/&lt;\/?em&gt;/gi, function (tag) { return tag.toLowerCase().includes('/') ? '</em>' : '<em>'; })
      .replace(/&lt;\/?i&gt;/gi, function (tag) { return tag.toLowerCase().includes('/') ? '</em>' : '<em>'; });
  }

  function inlineFormat(value) {
    return allowSafeAssistantHtml(escapeHtml(String(value || '')))
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/__(.+?)__/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function assistantPlainText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<li\b[^>]*>(.*?)<\/li>/gis, '• $1\n')
      .replace(/<\/?(?:p|div|h[1-6]|ul|ol)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/^\s*#{1,6}\s*(.*?)\s*#*\s*$/gm, '$1')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/^\s*>\s?/gm, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*(.*?)\*\*|__(.*?)__/gs, '$1$2')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2')
      .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }


  function normaliseList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(function (item) { return String(item); });
    return String(value).split(/\n|;|,/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function normalisePatternSummaryData(data) {
    const raw = data && typeof data === 'object' ? data : {};
    return {
      pattern_title: raw.pattern_title || raw.title || raw.detected_title || '',
      craft_type: raw.craft_type || raw.craft || '',
      item_type: raw.item_type || raw.project_type || raw.makes || '',
      difficulty_estimate: raw.difficulty_estimate || raw.difficulty || '',
      skills_required: normaliseList(raw.skills_required || raw.skills),
      yarn_requirements: normaliseList(raw.yarn_requirements || raw.yarn || raw.materials),
      tools_required: normaliseList(raw.tools_required || raw.tools || raw.needles_hooks),
      gauge_tension: raw.gauge_tension || raw.gauge || raw.tension || '',
      sizes_detected: normaliseList(raw.sizes_detected || raw.sizes),
      construction_summary: raw.construction_summary || raw.overview || raw.summary || '',
      tricky_sections: normaliseList(raw.tricky_sections || raw.tricky_areas || raw.watch_out_for),
      possible_issues: normaliseList(raw.possible_issues || raw.pattern_issues || raw.issues_to_check || raw.issues_found || raw.potential_issues),
      suggested_fixes: normaliseList(raw.suggested_fixes || raw.recommended_fixes || raw.recommended_actions || raw.issue_fixes || raw.next_actions),
      beginner_notes: normaliseList(raw.beginner_notes || raw.notes),
      missing_information: normaliseList(raw.missing_information || raw.missing),
      confidence_score: raw.confidence_score || raw.confidence || ''
    };
  }

  function renderSummaryList(items) {
    const list = normaliseList(items);
    if (!list.length) return '<span class="ss-summary-muted">Not clearly found in the uploaded text.</span>';
    return '<ul>' + list.slice(0, 8).map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>';
  }

  function renderPatternCheckBlock(data) {
    const issues = normaliseList(data && data.possible_issues);
    const fixes = normaliseList(data && data.suggested_fixes);
    if (!issues.length && !fixes.length) {
      return '<div class="ss-summary-check ss-summary-check-clear"><b>Pattern check</b><p>No obvious problems detected in this pattern from the available uploaded text.</p></div>';
    }
    return '<div class="ss-summary-check ss-summary-check-review"><b>Pattern check</b>' +
      (issues.length ? '<p>Potential issues to review:</p>' + renderSummaryList(issues) : '') +
      (fixes.length ? '<p>Suggested fixes / next actions:</p>' + renderSummaryList(fixes) : '') +
    '</div>';
  }

  function renderPatternSummaryCard(structured, fallbackText) {
    const data = normalisePatternSummaryData(structured || {});
    const title = data.pattern_title || 'Uploaded pattern summary';
    const meta = [data.craft_type, data.item_type, data.difficulty_estimate].filter(Boolean);
    const overview = data.construction_summary || fallbackText || 'I have loaded the pattern and can now help with sizing, stitches, gauge, materials and tricky instructions.';
    const missing = data.missing_information && data.missing_information.length ? '<div class="ss-summary-warning"><b>Worth checking:</b>' + renderSummaryList(data.missing_information) + '</div>' : '';
    return '' +
      '<div class="ss-pattern-summary-card">' +
        '<div class="ss-summary-top">' +
          '<span class="ss-summary-label">Pattern summary</span>' +
          '<h4>' + escapeHtml(title) + '</h4>' +
          (meta.length ? '<div class="ss-summary-meta">' + meta.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('') + '</div>' : '') +
        '</div>' +
        renderPatternCheckBlock(data) +
        '<div class="ss-summary-overview">' + formatAssistantText(overview) + '</div>' +
        '<div class="ss-summary-grid">' +
          '<div><b>Skills spotted</b>' + renderSummaryList(data.skills_required) + '</div>' +
          '<div><b>Yarn / materials</b>' + renderSummaryList(data.yarn_requirements) + '</div>' +
          '<div><b>Tools</b>' + renderSummaryList(data.tools_required) + '</div>' +
          '<div><b>Gauge / tension</b><p>' + (data.gauge_tension ? inlineFormat(data.gauge_tension) : '<span class="ss-summary-muted">Not clearly found in the uploaded text.</span>') + '</p></div>' +
          '<div><b>Sizes detected</b>' + renderSummaryList(data.sizes_detected) + '</div>' +
          '<div><b>Tricky areas</b>' + renderSummaryList(data.tricky_sections) + '</div>' +
        '</div>' +
        (data.beginner_notes && data.beginner_notes.length ? '<div class="ss-summary-notes"><b>Helpful notes</b>' + renderSummaryList(data.beginner_notes) + '</div>' : '') +
        missing +
        '<div class="ss-summary-actions"><button type="button" class="ss-summary-ask" data-ss-prompt="Give me a full and detailed row-by-row step-by-step guide for making this uploaded pattern.">Step-by-step guide</button><button type="button" class="ss-summary-ask" data-ss-prompt="Explain the trickiest part of my uploaded pattern in plain English.">Explain the tricky bit</button><button type="button" class="ss-summary-ask" data-ss-prompt="Find the gauge or tension information in my uploaded pattern.">Find gauge</button></div>' +
      '</div>';
  }

  function formatAssistantText(text) {
    const cleaned = stripAiMarkup(text).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    const lines = cleaned.split('\n');
    const parts = [];

    lines.forEach(function (rawLine) {
      const line = rawLine.trim();
      if (!line) return;

      const headingMatch = line.match(/^#{1,6}\s*(.*?)\s*#*$/);
      if (headingMatch) {
        parts.push('<h3 class="ss-ai-heading">' + inlineFormat(headingMatch[1]) + '</h3>');
        return;
      }

      if (/^(step\s*\d+|tip|note|example|example adjustment|why this works|what to do|quick answer|answer|important)\s*:/i.test(line)) {
        parts.push('<div class="ss-ai-heading">' + inlineFormat(line) + '</div>');
        return;
      }

      if (/^\d+\.\s+/.test(line) || /^[-•]\s+/.test(line)) {
        parts.push('<div class="ss-ai-listline">' + inlineFormat(line.replace(/^[-•]\s+/, '• ')) + '</div>');
        return;
      }

      parts.push('<p class="ss-ai-paragraph">' + inlineFormat(line) + '</p>');
    });

    return parts.join('');
  }

  function buildSmartQuickStarts(history, uploadedProject) {
    const project = uploadedProject || {};
    const hasPatternContext = !!(project.project_id || project.file_id || project.job_id || project.library_pattern_id || project.pattern_summary_text || project.pattern_summary_html || project.pattern_summary_structured);
    const summaryText = project.pattern_summary_text || stripAiMarkup(project.pattern_summary_html || '');
    const text = (history.map(function (m) { return m.content || ''; }).join(' ') + ' ' + summaryText).toLowerCase();
    const smart = [];

    if (/tension|gauge|swatch|10 cm|10cm/.test(text)) {
      smart.push('Based on my last question, help me adjust my tension using centimetres.');
      smart.push('What should I change if my tension square is too large or too small?');
    }
    if (/yarn|substitut|merino|cotton|dk|aran|chunky|metres|meter/.test(text)) {
      smart.push('Based on our last chat, help me check whether this yarn substitution will work.');
      smart.push('How many metres should I allow for this project if I change yarn?');
    }
    if (/crochet|dc|tr|htr|dtr|hook|round|yoke/.test(text)) {
      smart.push('Explain this crochet instruction in UK terminology.');
      smart.push('Help me work out the increase rate for a crochet yoke or circle.');
    }
    if (/knit|purl|k2tog|ssk|needle|cast|dropped/.test(text)) {
      smart.push('Explain this knitting abbreviation and how to work it.');
      smart.push('Help me fix a mistake in my knitting without unravelling everything.');
    }
    if (/size|resize|fit|chest|ease|measurement/.test(text)) {
      smart.push('Help me resize this pattern using centimetres and finished measurements.');
      smart.push('Explain how much ease I should allow for this garment.');
    }

    if (hasPatternContext) {
      smart.unshift('Summarise this pattern in plain English.');
      smart.unshift('Explain the next row or round from this pattern.');
      smart.unshift('Find any tricky instructions in this pattern and simplify them.');
      smart.unshift('Give me a full and detailed row-by-row step-by-step guide for making this pattern.');
    }

    return smart.concat(defaultQuickStarts).filter(function (item, index, arr) {
      return arr.indexOf(item) === index;
    }).slice(0, 5);
  }


  function ssPdfDbOpen() {
    return new Promise(function(resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open('stitchsense_pattern_files_v1', 1);
      req.onupgradeneeded = function() {
        const db = req.result;
        if (!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs');
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error || new Error('IndexedDB open failed')); };
    });
  }

  function ssPdfDbPut(key, blob) {
    if (!key || !blob) return Promise.resolve(false);
    return ssPdfDbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction('pdfs', 'readwrite');
        tx.objectStore('pdfs').put(blob, key);
        tx.oncomplete = function() { db.close(); resolve(true); };
        tx.onerror = function() { db.close(); reject(tx.error || new Error('PDF cache save failed')); };
      });
    });
  }

  function ssPdfDbGet(key) {
    if (!key) return Promise.resolve(null);
    return ssPdfDbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction('pdfs', 'readonly');
        const req = tx.objectStore('pdfs').get(key);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { reject(req.error || new Error('PDF cache read failed')); };
      });
    }).catch(function(err) {
      if (window.ssDebug === true) console.warn('StitchSense PDF cache unavailable:', err);
      return null;
    });
  }

  function restoreUploadedProjectPdf(project, persist) {
    if (!project || !project.pdf_blob_key || project.pdf_blob_restored) return Promise.resolve(false);
    return ssPdfDbGet(project.pdf_blob_key).then(function(blob) {
      if (blob) {
        project.local_pdf_url = URL.createObjectURL(blob);
        project.pdf_blob_restored = true;
        if (typeof persist === 'function') persist();
        return true;
      }
      return false;
    }).catch(function() { return false; });
  }

  function initHub(root) {
    enhanceIconControls(root);
    const storagePrefix = 'stitchsense_hub_pro_v5_';
    const skill = qs(root, '[data-ss-skill]');
    const messages = qs(root, '[data-ss-messages]');
    const question = qs(root, '[data-ss-question]');
    const send = qs(root, '[data-ss-send]');
    const reset = qs(root, '[data-ss-reset]');
    const thinking = qs(root, '[data-ss-thinking]');

    const pendingSuggestedPrompt = localStorage.getItem(storagePrefix + 'suggested_prompt');
    if (pendingSuggestedPrompt && question && !question.value.trim()) {
      question.value = pendingSuggestedPrompt;
      localStorage.removeItem(storagePrefix + 'suggested_prompt');
    }

    let sessionId = localStorage.getItem(storagePrefix + 'session');
    if (!sessionId) {
      sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'session_' + Date.now();
      localStorage.setItem(storagePrefix + 'session', sessionId);
    }

    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(storagePrefix + 'history') || '[]');
      if (!Array.isArray(history)) history = [];
    } catch (e) { history = []; }

    const savedSkill = localStorage.getItem(storagePrefix + 'skill');
    if (savedSkill && skill) skill.value = savedSkill;

    let uploadedProject = null;
    try {
      uploadedProject = JSON.parse(localStorage.getItem(storagePrefix + 'uploaded_project') || 'null');
    } catch (e) {
      uploadedProject = null;
    }
    let currentPatternPdfBlob = null;
    let currentPatternPdfTextCacheKey = '';
    let currentPatternPdfTextCache = '';
    let libraryPatternId = localStorage.getItem(storagePrefix + 'library_pattern_id') || (uploadedProject && uploadedProject.library_pattern_id) || '';
    let activeChatSessionId = localStorage.getItem(storagePrefix + 'library_chat_session_id') || '';
    let resetReworkState = function () { clearReworkStorage(); };

    if (uploadedProject && uploadedProject.local_pdf_url && String(uploadedProject.local_pdf_url).indexOf('blob:') === 0) {
      uploadedProject.local_pdf_url = '';
      uploadedProject.pdf_blob_restored = false;
      localStorage.setItem(storagePrefix + 'uploaded_project', JSON.stringify(uploadedProject));
    }

    const ssDefaultStepGuidePrompt = 'Use the uploaded pattern PDF text and explain the instructions in plain English. Give me a practical step-by-step, row-by-row guide. If any row or section is genuinely missing, tell me exactly which one is missing.';
    const ssPatternSummaryPrompt = 'Create a structured smart summary of the uploaded knitting or crochet pattern. Return the key overview, skills, yarn/materials, tools, gauge/tension, sizes, tricky areas, beginner notes, missing information, potential issues to check, and practical suggested fixes or next actions. If you spot corrections, confusing rows, missing essentials, terminology ambiguity or stitch-count risks, include them clearly in the summary without overclaiming.';
    const ssPatternInstructionTextLimit = 24000;
    if (question) {
      if (hasLoadedPatternContext() && !question.value.trim()) {
        question.value = ssDefaultStepGuidePrompt;
      }
      question.setAttribute('placeholder', 'Paste a tricky pattern line or ask a question...');
    }

    function getPatternPdfUrl() {
      if (!uploadedProject) return '';
      if (uploadedProject.file_url || uploadedProject.pdf_url || uploadedProject.public_url || uploadedProject.uploaded_file_url || uploadedProject.pattern_url || uploadedProject.url) {
        return uploadedProject.file_url || uploadedProject.pdf_url || uploadedProject.public_url || uploadedProject.uploaded_file_url || uploadedProject.pattern_url || uploadedProject.url || '';
      }
      if (uploadedProject.local_pdf_url && String(uploadedProject.local_pdf_url).indexOf('blob:') !== 0) {
        return uploadedProject.local_pdf_url;
      }
      return '';
    }

    function getPatternPdfBlob() {
      if (currentPatternPdfBlob) return Promise.resolve(currentPatternPdfBlob);
      if (!uploadedProject || !uploadedProject.pdf_blob_key) return Promise.resolve(null);
      return ssPdfDbGet(uploadedProject.pdf_blob_key).then(function(blob) {
        if (blob) return blob;
        if (window.ssDebug === true) console.warn('StitchSense PDF cache returned null for key:', uploadedProject.pdf_blob_key);
        return null;
      });
    }

    function questionNeedsPatternInstructionText(text, toolMode) {
      const q = String(text || '').toLowerCase();
      return toolMode === 'pattern_step_guide' ||
        /(?:row[\s-]*by[\s-]*row|round[\s-]*by[\s-]*round|step[\s-]*by[\s-]*step|walk\s+me\s+through|guide\s+me\s+through|full\s+(?:and\s+)?(?:detailed\s+)?(?:guide|instructions?|breakdown)|detailed\s+(?:guide|instructions?|breakdown)|what\s+do\s+i\s+do\s+first|where\s+do\s+i\s+start)/i.test(q);
    }

    function getPatternPdfTextCacheKey() {
      if (!uploadedProject) return '';
      return [
        uploadedProject.project_id || '',
        uploadedProject.file_id || '',
        uploadedProject.job_id || '',
        uploadedProject.pdf_blob_key || '',
        uploadedProject.file_url || '',
        uploadedProject.original_filename || ''
      ].join('|');
    }

    function tidyPdfTextLine(text) {
      return String(text || '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
    }

    async function loadPatternPdfDocumentForText() {
      if (!window.pdfjsLib) return null;
      const blob = await getPatternPdfBlob();
      if (blob) {
        const buffer = await blob.arrayBuffer();
        return window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      }
      const url = getPatternPdfUrl();
      if (!url) return null;
      return window.pdfjsLib.getDocument({ url: url, withCredentials: false }).promise;
    }

    async function extractPatternPdfInstructionText(maxChars) {
      if (!hasLoadedPatternContext()) return '';
      const limit = Math.max(4000, maxChars || ssPatternInstructionTextLimit);
      const cacheKey = getPatternPdfTextCacheKey();
      if (cacheKey && currentPatternPdfTextCacheKey === cacheKey && currentPatternPdfTextCache) {
        return currentPatternPdfTextCache.slice(0, limit);
      }
      try {
        const doc = await loadPatternPdfDocumentForText();
        if (!doc || !doc.numPages) return '';
        const pages = [];
        let collected = 0;
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
          const page = await doc.getPage(pageNum);
          const content = await page.getTextContent();
          const line = tidyPdfTextLine((content.items || []).map(function(item) {
            return item && item.str ? item.str : '';
          }).join(' '));
          if (!line) continue;
          const pageText = '[Page ' + pageNum + ']\n' + line;
          pages.push(pageText);
          collected += pageText.length;
          if (collected >= limit) break;
        }
        const text = pages.join('\n\n').slice(0, limit);
        currentPatternPdfTextCacheKey = cacheKey;
        currentPatternPdfTextCache = text;
        return text;
      } catch (err) {
        if (window.ssDebug === true) console.warn('StitchSense PDF text extraction failed:', err);
        return '';
      }
    }

    function hasLoadedPatternContext(project) {
      const p = project || uploadedProject;
      return !!(p && (
        p.project_id ||
        p.file_id ||
        p.job_id ||
        p.library_pattern_id ||
        p.pattern_summary_text ||
        p.pattern_summary_html ||
        p.pattern_summary_structured
      ));
    }

    function hasViewablePatternFile(project) {
      const p = project || uploadedProject;
      return !!(p && (
        p.project_id ||
        p.file_url ||
        p.pdf_url ||
        p.public_url ||
        p.uploaded_file_url ||
        p.local_pdf_url ||
        p.pdf_blob_key
      ));
    }

    function updatePatternViewerButton() {
      const btn = qs(root, '[data-ss-view-pattern]');
      if (!btn) return;
      const hasPattern = hasViewablePatternFile();
      btn.hidden = !hasPattern;
      btn.disabled = !hasPattern;
    }

    const pdfViewerState = {
      doc: null,
      page: 1,
      scale: 1.15,
      rendering: false,
      pending: false,
      sourceName: ''
    };

    function getPdfViewerParts(viewer) {
      return {
        canvas: qs(viewer, '[data-ss-pdf-canvas]'),
        stage: qs(viewer, '[data-ss-pdf-stage]'),
        fallback: qs(viewer, '[data-ss-pattern-viewer-fallback]'),
        page: qs(viewer, '[data-ss-pdf-page]'),
        pages: qs(viewer, '[data-ss-pdf-pages]')
      };
    }

    function showPdfFallback(viewer, message) {
      const parts = getPdfViewerParts(viewer);
      if (parts.fallback) {
        parts.fallback.hidden = false;
        parts.fallback.innerHTML = escapeHtml(message || 'The PDF preview could not be loaded. Please re-upload the pattern and try again.');
      }
      if (parts.canvas) parts.canvas.hidden = true;
    }

    function fitPdfScaleToStage(page, stage) {
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, (stage ? stage.clientWidth : 900) - 32);
      return Math.max(0.45, Math.min(2.6, availableWidth / baseViewport.width));
    }

    function renderPdfPage(viewer, opts) {
      if (!pdfViewerState.doc || pdfViewerState.rendering) {
        if (pdfViewerState.rendering) pdfViewerState.pending = true;
        return Promise.resolve();
      }
      const parts = getPdfViewerParts(viewer);
      if (!parts.canvas) return Promise.resolve();
      pdfViewerState.rendering = true;
      parts.canvas.hidden = false;
      if (parts.fallback) parts.fallback.hidden = true;

      return pdfViewerState.doc.getPage(pdfViewerState.page).then(function(page) {
        if (opts && opts.fit && parts.stage) {
          pdfViewerState.scale = fitPdfScaleToStage(page, parts.stage);
        }
        const viewport = page.getViewport({ scale: pdfViewerState.scale });
        const dpr = window.devicePixelRatio || 1;
        const canvas = parts.canvas;
        const context = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        if (parts.page) parts.page.textContent = String(pdfViewerState.page);
        if (parts.pages) parts.pages.textContent = String(pdfViewerState.doc.numPages || 1);
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
        };
        return page.render(renderContext).promise;
      }).then(function() {
        pdfViewerState.rendering = false;
        if (pdfViewerState.pending) {
          pdfViewerState.pending = false;
          return renderPdfPage(viewer);
        }
      }).catch(function(err) {
        pdfViewerState.rendering = false;
        if (window.ssDebug === true) console.warn('StitchSense PDF render failed:', err);
        showPdfFallback(viewer, 'The PDF opened, but this page could not be rendered. Please try zooming or re-uploading the pattern.');
      });
    }

    function loadPdfIntoViewer(viewer) {
      const parts = getPdfViewerParts(viewer);
      const ext = uploadedProject ? String(uploadedProject.file_extension || getFileExtension(uploadedProject.original_filename || '')).toLowerCase() : '';
      if (uploadedProject && ext && ext !== 'pdf') {
        showPdfFallback(viewer, 'Preview is currently available for PDF uploads only. This ' + ext.toUpperCase() + ' pattern has still been uploaded, extracted and analysed, so you can keep asking questions about it in Pattern Help.');
        return;
      }
      if (parts.fallback) { parts.fallback.hidden = false; parts.fallback.innerHTML = 'Loading your uploaded PDF…'; }
      if (!window.pdfjsLib) {
        showPdfFallback(viewer, 'PDF.js could not load. Please check your connection and refresh the page.');
        return;
      }

      getPatternPdfBlob().then(function(blob) {
        if (blob) {
          return blob.arrayBuffer().then(function(buffer) {
            return window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
          });
        }
        const url = getPatternPdfUrl();
        if (!url) throw new Error('No PDF file source available.');
        return window.pdfjsLib.getDocument({ url: url, withCredentials: false }).promise;
      }).then(function(doc) {
        pdfViewerState.doc = doc;
        pdfViewerState.page = 1;
        pdfViewerState.scale = 1.15;
        if (parts.pages) parts.pages.textContent = String(doc.numPages || 1);
        return renderPdfPage(viewer, { fit: true });
      }).catch(function(err) {
        if (window.ssDebug === true) console.warn('StitchSense PDF.js load failed:', err);
        showPdfFallback(viewer, 'I could not load the PDF preview from the uploaded file. Please re-upload the pattern and try View Pattern again.');
      });
    }

    function bindPatternViewer(viewer) {
      if (!viewer || viewer.dataset.ssPdfjsBound === 'true') return;
      viewer.dataset.ssPdfjsBound = 'true';
      viewer.addEventListener('click', function(event) {
        if (event.target.closest('[data-ss-pattern-viewer-close], [data-ss-close-pattern-viewer], [data-ss-pattern-viewer-backdrop]')) {
          event.preventDefault();
          closePatternViewer();
          return;
        }
        if (event.target.closest('[data-ss-pdf-prev]')) {
          event.preventDefault();
          if (pdfViewerState.doc && pdfViewerState.page > 1) {
            pdfViewerState.page -= 1;
            renderPdfPage(viewer);
          }
          return;
        }
        if (event.target.closest('[data-ss-pdf-next]')) {
          event.preventDefault();
          if (pdfViewerState.doc && pdfViewerState.page < pdfViewerState.doc.numPages) {
            pdfViewerState.page += 1;
            renderPdfPage(viewer);
          }
          return;
        }
        if (event.target.closest('[data-ss-pdf-zoom-in]')) {
          event.preventDefault();
          pdfViewerState.scale = Math.min(3.25, pdfViewerState.scale + 0.15);
          renderPdfPage(viewer);
          return;
        }
        if (event.target.closest('[data-ss-pdf-zoom-out]')) {
          event.preventDefault();
          pdfViewerState.scale = Math.max(0.4, pdfViewerState.scale - 0.15);
          renderPdfPage(viewer);
          return;
        }
        if (event.target.closest('[data-ss-pdf-fit]')) {
          event.preventDefault();
          renderPdfPage(viewer, { fit: true });
          return;
        }
      });
    }

    function openPatternViewer() {
      let viewer = qs(document, '[data-ss-pattern-viewer]') || qs(root, '[data-ss-pattern-viewer]');
      if (!viewer) return;
      if (viewer.parentNode !== document.body) document.body.appendChild(viewer);
      bindPatternViewer(viewer);
      const title = qs(viewer, '[data-ss-pattern-viewer-title]');
      if (title) title.textContent = (uploadedProject && (uploadedProject.detected_title || uploadedProject.original_filename || uploadedProject.project_name)) || 'Uploaded pattern';
      viewer.hidden = false;
      viewer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ss-pattern-viewer-open');
      loadPdfIntoViewer(viewer);
    }

    function closePatternViewer() {
      const viewer = qs(document, '[data-ss-pattern-viewer]') || qs(root, '[data-ss-pattern-viewer]');
      if (!viewer) return;
      viewer.hidden = true;
      viewer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('ss-pattern-viewer-open');
    }

    function persistUploadedProject() {
      if (hasLoadedPatternContext()) {
        if (libraryPatternId) uploadedProject.library_pattern_id = libraryPatternId;
        localStorage.setItem(storagePrefix + 'uploaded_project', JSON.stringify(uploadedProject));
      } else {
        localStorage.removeItem(storagePrefix + 'uploaded_project');
      }
    }

    function setLibraryPatternId(id) {
      libraryPatternId = id || '';
      if (libraryPatternId) localStorage.setItem(storagePrefix + 'library_pattern_id', libraryPatternId);
      else localStorage.removeItem(storagePrefix + 'library_pattern_id');
      if (uploadedProject) uploadedProject.library_pattern_id = libraryPatternId;
    }

    function setActiveChatSessionId(id) {
      activeChatSessionId = id || '';
      if (activeChatSessionId) localStorage.setItem(storagePrefix + 'library_chat_session_id', activeChatSessionId);
      else localStorage.removeItem(storagePrefix + 'library_chat_session_id');
    }

    function libraryAvailable() {
      return !!(isUserLoggedIn && restUrl && wpRestNonce);
    }

    async function libraryRequest(path, options) {
      if (!libraryAvailable()) throw new Error('Pattern Library is available after login.');
      const opts = options || {};
      const headers = Object.assign({
        'Accept': 'application/json',
        'X-WP-Nonce': wpRestNonce
      }, opts.headers || {});
      if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
      const response = await fetch(restUrl + path.replace(/^\/+/, ''), Object.assign({
        credentials: 'same-origin',
        cache: 'no-store'
      }, opts, { headers: headers }));
      const data = await ssParseJsonResponse(response);
      if (!response.ok || data.success === false) throw new Error(data.error || ('Library request failed: HTTP ' + response.status));
      return data;
    }

    function uploadedProjectPayload(source, extra) {
      const p = uploadedProject || {};
      return Object.assign({
        id: p.library_pattern_id || libraryPatternId || undefined,
        title: p.detected_title || p.title || p.project_name || p.original_filename || 'Untitled',
        detected_title: p.detected_title || p.title || '',
        craft_type: p.craft_type || '',
        original_filename: p.original_filename || '',
        file_url: p.file_url || p.drive_link || '',
        project_id: p.project_id || '',
        file_id: p.file_id || '',
        job_id: p.job_id || '',
        detected_design_code: p.detected_design_code || '',
        pattern_summary_html: p.pattern_summary_html || '',
        pattern_summary_text: p.pattern_summary_text || '',
        pattern_summary_structured: p.pattern_summary_structured || null,
        source: source || 'upload',
        metadata: {
          file_extension: p.file_extension || getFileExtension(p.original_filename || ''),
          file_mime_type: p.file_mime_type || '',
          total_chunks: p.total_chunks || 0,
          uploaded_at: p.uploaded_at || ''
        }
      }, extra || {});
    }

    function activePatternContextPayload(includePattern) {
      if (!includePattern || !hasLoadedPatternContext()) {
        return { pattern_available: false };
      }
      const p = uploadedProject || {};
      const metadata = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
      const structured = p.pattern_summary_structured || null;
      const summaryText = p.pattern_summary_text || stripAiMarkup(p.pattern_summary_html || '');
      return {
        project_id: p.project_id || undefined,
        file_id: p.file_id || undefined,
        job_id: p.job_id || undefined,
        library_pattern_id: p.library_pattern_id || libraryPatternId || undefined,
        ravelry_id: p.ravelry_id || metadata.ravelry_id || undefined,
        ravelry_url: p.ravelry_url || metadata.ravelry_url || undefined,
        uploaded_pattern_title: p.detected_title || p.title || p.original_filename || undefined,
        uploaded_pattern_summary: summaryText || undefined,
        pattern_summary_text: summaryText || undefined,
        pattern_summary_html: p.pattern_summary_html || undefined,
        pattern_summary_structured: structured || undefined,
        pattern_metadata: metadata,
        pattern_source: p.source || metadata.source || undefined,
        pattern_available: true
      };
    }

    async function buildPatternChatContextPayload(text, includePattern, toolMode) {
      const payload = activePatternContextPayload(includePattern);
      if (!includePattern || !payload.pattern_available || !questionNeedsPatternInstructionText(text, toolMode)) {
        return payload;
      }

      const extractedText = await extractPatternPdfInstructionText(ssPatternInstructionTextLimit);
      if (!extractedText) {
        payload.pattern_instruction_context_status = 'pdf_text_unavailable';
        return payload;
      }

      payload.pattern_instruction_context_status = 'pdf_text_extracted';
      payload.pattern_instruction_text = extractedText;
      payload.pattern_context_mode = 'uploaded_pdf_instruction_text';
      payload.pattern_instruction_prompt = 'Use pattern_instruction_text as primary evidence for this row-by-row or step-by-step request. Do not say there is not enough information unless that extracted text truly lacks the requested rows or section; if something is missing, name the exact missing row, round, section or page.';
      return payload;
    }

    async function saveActivePatternToLibrary(source, extra) {
      if (!libraryAvailable() || !(uploadedProject && uploadedProject.project_id)) return null;
      try {
        const data = await libraryRequest('library/patterns', {
          method: 'POST',
          body: JSON.stringify(uploadedProjectPayload(source, extra))
        });
        const pattern = data.pattern || null;
        const id = data.id || (pattern && pattern.id) || '';
        if (id) {
          setLibraryPatternId(id);
          persistUploadedProject();
        }
        root.dispatchEvent(new CustomEvent('stitchsense-library-saved', { detail: { pattern: pattern || data } }));
        return pattern || data;
      } catch (err) {
        root.dispatchEvent(new CustomEvent('stitchsense-library-save-failed', { detail: { error: err && err.message ? err.message : 'Library save failed.' } }));
        console.warn('StitchSense library pattern save failed:', err);
        return null;
      }
    }

    async function savePatternFileToWordPress(file, fileDataUri, projectId, patternId) {
      if (!libraryAvailable() || !file) return null;
      try {
        const formData = new FormData();
        formData.append('pattern_file', file, file.name || 'pattern-upload');
        formData.append('file_name', file.name || 'pattern-upload');
        formData.append('mime_type', file.type || 'application/octet-stream');
        formData.append('file_size', String(file.size || 0));
        formData.append('project_id', projectId || '');
        formData.append('pattern_id', patternId || '');
        return await libraryRequest('library/pattern-file', {
          method: 'POST',
          body: formData
        });
      } catch (err) {
        if (!fileDataUri) {
          console.warn('StitchSense WordPress pattern file save failed:', err);
          return null;
        }
        try {
          return await libraryRequest('library/pattern-file', {
            method: 'POST',
            body: JSON.stringify({
              file_data_uri: fileDataUri,
              file_name: file.name || 'pattern-upload',
              mime_type: file.type || 'application/octet-stream',
              file_size: file.size || 0,
              project_id: projectId || '',
              pattern_id: patternId || ''
            })
          });
        } catch (fallbackErr) {
          console.warn('StitchSense WordPress pattern file save failed:', fallbackErr);
          return null;
        }
      }
    }

    async function ensureLibraryChatSession(title) {
      if (!libraryAvailable()) return '';
      if (!libraryPatternId && uploadedProject && uploadedProject.project_id) {
        await saveActivePatternToLibrary('upload');
      }
      if (!libraryPatternId) return '';
      if (activeChatSessionId) return activeChatSessionId;
      try {
        const data = await libraryRequest('library/chats', {
          method: 'POST',
          body: JSON.stringify({
            pattern_id: libraryPatternId,
            title: title || ((uploadedProject && (uploadedProject.detected_title || uploadedProject.original_filename)) || 'Pattern chat'),
            skill_level: skill ? skill.value : 'beginner'
          })
        });
        setActiveChatSessionId(data.id || (data.session && data.session.id) || '');
        return activeChatSessionId;
      } catch (err) {
        console.warn('StitchSense library chat session failed:', err);
        return '';
      }
    }

    async function saveChatPairToLibrary(userText, assistantText, toolMode) {
      if (!libraryAvailable() || !userText || !assistantText || !hasLoadedPatternContext()) return;
      const chatId = await ensureLibraryChatSession();
      if (!chatId) return;
      try {
        await libraryRequest('library/chats/' + encodeURIComponent(chatId) + '/messages', {
          method: 'PUT',
          body: JSON.stringify({
            messages: [
              { role: 'user', content: userText, kind: 'message', tool_mode: toolMode || '' },
              { role: 'assistant', content: assistantText, kind: 'message', tool_mode: toolMode || '' }
            ]
          })
        });
        root.dispatchEvent(new CustomEvent('stitchsense-library-history-changed', {
          detail: { pattern_id: libraryPatternId, kind: 'chat', chat_id: chatId }
        }));
      } catch (err) {
        console.warn('StitchSense library chat save failed:', err);
      }
    }

    async function saveRewriteToLibrary(promptText, answerText, changes, warnings, confidence) {
      if (!libraryAvailable() || !answerText || !hasLoadedPatternContext()) return;
      if (!libraryPatternId) await saveActivePatternToLibrary('upload');
      if (!libraryPatternId) return;
      await saveChatPairToLibrary(promptText, answerText, 'pattern_rewrite');
      try {
        await libraryRequest('library/rewrites', {
          method: 'POST',
          body: JSON.stringify({
            pattern_id: libraryPatternId,
            prompt: promptText || '',
            rewrite_result: answerText,
            rewrite_changes: changes || [],
            rewrite_warnings: warnings || [],
            confidence_score: confidence || 0
          })
        });
        root.dispatchEvent(new CustomEvent('stitchsense-library-history-changed', {
          detail: { pattern_id: libraryPatternId, kind: 'rewrite' }
        }));
      } catch (err) {
        console.warn('StitchSense library rewrite save failed:', err);
      }
      try {
        const childPattern = await libraryRequest('library/patterns', {
          method: 'POST',
          body: JSON.stringify(uploadedProjectPayload('rewrite', {
            id: undefined,
            project_id: (uploadedProject.project_id || '') + '_rewrite_' + Date.now(),
            title: ((uploadedProject.detected_title || 'Pattern') + ' Rewrite').trim(),
            parent_pattern_id: libraryPatternId,
            pattern_summary_html: formatAssistantText(answerText),
            pattern_summary_text: answerText,
            metadata: {
              rewrite_changes: changes || [],
              rewrite_warnings: warnings || [],
              confidence_score: confidence || 0,
              parent_project_id: uploadedProject.project_id || '',
              parent_file_url: uploadedProject.file_url || '',
              parent_file_extension: uploadedProject.file_extension || getFileExtension(uploadedProject.original_filename || ''),
              parent_original_filename: uploadedProject.original_filename || '',
              parent_pdf_blob_key: uploadedProject.pdf_blob_key || ''
            }
          }))
        });
        root.dispatchEvent(new CustomEvent('stitchsense-library-saved', {
          detail: { pattern: childPattern && (childPattern.pattern || childPattern), kind: 'rewrite_child' }
        }));
      } catch (err) {
        console.warn('StitchSense child rewrite pattern save failed:', err);
      }
    }

    function createFreshSession() {
      sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(storagePrefix + 'session', sessionId);
      return sessionId;
    }

    function clearUploadedPatternState(options) {
      const opts = options || {};
      history = [];
      if (uploadedProject && uploadedProject.local_pdf_url && uploadedProject.local_pdf_url.indexOf('blob:') === 0) {
        try { URL.revokeObjectURL(uploadedProject.local_pdf_url); } catch (e) {}
      }
      currentPatternPdfBlob = null;
      currentPatternPdfTextCacheKey = '';
      currentPatternPdfTextCache = '';
      uploadedProject = null;
      setLibraryPatternId('');
      setActiveChatSessionId('');
      updatePatternViewerButton();
      closePatternViewer();
      localStorage.removeItem(storagePrefix + 'history');
      localStorage.removeItem(storagePrefix + 'uploaded_project');
      if (opts.newSession !== false) createFreshSession();
    }

    function clearReworkStorage() {
      try {
        localStorage.removeItem(storagePrefix + 'rework_history');
        localStorage.removeItem(storagePrefix + 'rework_session_id');
        localStorage.removeItem(storagePrefix + 'rework_result');
        localStorage.removeItem(storagePrefix + 'rework_changes');
        localStorage.removeItem(storagePrefix + 'rework_warnings');
        localStorage.removeItem(storagePrefix + 'rework_confidence');
        localStorage.removeItem(storagePrefix + 'rework_original');
      } catch(e) {}
    }

    function buildUploadSummaryFallback(data) {
      const title = data.detected_title || data.project_name || data.original_filename || 'your uploaded pattern';
      const chunks = data.total_chunks ? ' I found ' + data.total_chunks + ' text sections to work from.' : '';
      return "<b>Pattern uploaded and ready.</b><br>I've loaded <b>" + escapeHtml(title) + "</b>." + chunks + "<br>Ask me about the sizing, yarn, stitch counts, abbreviations, or any row that looks like a headache in disguise.";
    }

    async function fetchInitialPatternSummary(data) {
      if (!data || !data.project_id) { const fallback = buildUploadSummaryFallback(data || {}); return { text: fallback, structured: null, html: fallback }; }
      try {
        const response = await ssPostChat({
            action: 'chat',
            question: ssPatternSummaryPrompt,
            tool_mode: 'pattern_summary',
            session_id: sessionId,
            skill_level: skill ? skill.value : 'beginner',
            history: [],
            project_id: data.project_id,
            file_id: data.file_id || undefined,
            job_id: data.job_id || undefined,
            uploaded_pattern_title: data.detected_title || undefined
          });
        const summaryData = await ssParseJsonResponse(response);
        if (response.ok && summaryData && summaryData.success !== false && summaryData.answer) {
          const structured = ssEnsureSummaryTitle(summaryData.structured_data || summaryData.pattern_summary || summaryData.summary || null, data.detected_title || data.project_name || data.original_filename || '');
          return {
            text: summaryData.answer,
            structured: structured,
            html: renderPatternSummaryCard(structured, summaryData.answer)
          };
        }
      } catch (error) {
        if (window.ssDebug === true) console.warn('StitchSense initial summary failed:', error);
      }
      const fallback = data.pattern_summary_html || data.pattern_summary_text || buildUploadSummaryFallback(data);
      return { text: fallback, structured: null, html: fallback };
    }

    function save() {
      history = history.slice(-12);
      localStorage.setItem(storagePrefix + 'history', JSON.stringify(history));
      persistUploadedProject();
    }

    const uploadModal = qs(root, '[data-ss-upload-modal]') || qs(root, '[data-ss-upload-canvas]');
    const openUploadButtons = qsa(root, '[data-ss-open-upload], [data-ss-upload-canvas-toggle], [data-ss-open-upload-pattern]');
    const closeUploadButtons = qsa(root, '[data-ss-upload-close], [data-ss-upload-canvas-close]');
    const fileDrop = qs(root, '[data-ss-file-drop]');
    const fileInput = qs(root, '[data-ss-file-input]');
    const fileTitle = qs(root, '[data-ss-file-title]');
    const fileSubtitle = qs(root, '[data-ss-file-subtitle]');
    const uploadSubmit = qs(root, '[data-ss-upload-submit]');
    const uploadResult = qs(root, '[data-ss-upload-result]');
    const uploadProgress = qs(root, '[data-ss-upload-progress]');
    const uploadProgressLabel = qs(root, '[data-ss-upload-progress-label]');
    const uploadProgressBar = qs(root, '[data-ss-upload-progress-bar]');
    const uploadProjectName = qs(root, '[data-ss-upload-project-name]');
    const uploadCraft = qs(root, '[data-ss-upload-craft]');
    let selectedPatternFile = null;
    let uploadInFlight = false;

    function openUploadModal() {
      if (!uploadModal) return;

      // v7.4.28: move the overlay to <body> while open.
      // Some WordPress themes wrap content in transformed/sticky containers, which
      // makes position:fixed behave like it belongs to the app panel rather than
      // the viewport. Body-level placement keeps the upload modal truly centred.
      try {
        if (!uploadModal.dataset.ssOriginalParent && uploadModal.parentNode) {
          uploadModal.dataset.ssOriginalParent = 'body-open';
          document.body.appendChild(uploadModal);
        } else if (uploadModal.parentNode !== document.body) {
          document.body.appendChild(uploadModal);
        }
      } catch (e) {}

      uploadModal.hidden = false;
      uploadModal.classList.add('is-open');
      document.body.classList.add('ss-modal-open');
      setUploadProgress(false, '', 0);
      setSelectedFile(null);
      if (fileInput) { try { fileInput.value = ''; } catch(e) {} }
      setUploadMessage('', '');
    }

    function closeUploadModal() {
      if (!uploadModal) return;
      uploadModal.hidden = true;
      uploadModal.classList.remove('is-open');
      document.body.classList.remove('ss-modal-open');
    }

    function setUploadMessage(type, message) {
      if (!uploadResult) return;
      uploadResult.className = 'ss-upload-result ' + (type ? 'is-' + type : '');
      uploadResult.innerHTML = message || '';
    }

    function setUploadProgress(active, label, percent) {
      if (!uploadProgress) return;
      uploadProgress.hidden = !active;
      if (uploadProgressLabel) uploadProgressLabel.textContent = label || 'Uploading…';
      if (uploadProgressBar) uploadProgressBar.style.width = Math.max(0, Math.min(100, percent || 0)) + '%';
      if (uploadSubmit) uploadSubmit.disabled = active || !selectedPatternFile;
    }

    function setSelectedFile(file) {
      selectedPatternFile = file || null;

      if (!selectedPatternFile) {
        if (fileTitle) fileTitle.textContent = 'Drop pattern file here or click to choose';
        if (fileSubtitle) fileSubtitle.textContent = supportedPatternHelpText;
        if (uploadSubmit) uploadSubmit.disabled = true;
        if (fileDrop) fileDrop.classList.remove('has-file');
        return;
      }

      if (!isSupportedPatternFile(selectedPatternFile)) {
        selectedPatternFile = null;
        setUploadMessage('error', '<b>Unsupported file type.</b><br>Please choose a supported pattern file: ' + escapeHtml(supportedPatternHelpText));
        if (uploadSubmit) uploadSubmit.disabled = true;
        return;
      }

      if (selectedPatternFile.size > SS_PATTERN_MAX_BYTES) {
        selectedPatternFile = null;
        setUploadMessage('error', '<b>File too large.</b><br>Please choose a supported pattern file under 50 MB.');
        if (uploadSubmit) uploadSubmit.disabled = true;
        return;
      }

      if (fileDrop) fileDrop.classList.add('has-file');
      if (fileTitle) fileTitle.textContent = selectedPatternFile.name || 'Selected pattern file';
      if (fileSubtitle) fileSubtitle.textContent = Math.round(selectedPatternFile.size / 1024) + ' KB selected';
      if (uploadProjectName && !uploadProjectName.value) {
        uploadProjectName.value = (selectedPatternFile.name || 'Uploaded pattern').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      }
      if (uploadSubmit) uploadSubmit.disabled = false;
      setUploadMessage('', '');
    }

    async function uploadSelectedPattern() {
      if (uploadInFlight) return;
      if (!selectedPatternFile) {
        setUploadMessage('error', '<b>No file selected.</b><br>Please choose a supported pattern file first.');
        return;
      }

      const uploadFile = selectedPatternFile;
      const projectNameValue = uploadProjectName && uploadProjectName.value ? uploadProjectName.value : (uploadFile.name || 'Uploaded pattern').replace(/\.[^.]+$/, '');
      const craftValue = uploadCraft && uploadCraft.value ? uploadCraft.value : '';

      function readFileAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
          const reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result || '')); };
          reader.onerror = function () { reject(new Error('Could not read the selected file. Please try choosing it again.')); };
          reader.readAsDataURL(file);
        });
      }

      setUploadMessage('', '');
      uploadInFlight = true;
      if (uploadSubmit) uploadSubmit.disabled = true;
      setUploadProgress(true, 'Preparing file…', 10);

      try {
        const largeWorkflowUpload = uploadFile.size > SS_PATTERN_INLINE_UPLOAD_BYTES;
        const preuploadProjectId = 'upload_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        let wpStoredFile = null;
        let fileDataUri = '';

        if (libraryAvailable()) {
          setUploadProgress(true, 'Saving file to your library…', 18);
          wpStoredFile = await savePatternFileToWordPress(uploadFile, '', preuploadProjectId);
        }

        if (!largeWorkflowUpload || !(wpStoredFile && wpStoredFile.file_url)) {
          setUploadProgress(true, 'Preparing file…', 22);
          fileDataUri = await readFileAsDataUrl(uploadFile);
          if (!fileDataUri || fileDataUri.indexOf('base64,') === -1) {
            throw new Error('Could not prepare this file for upload. Please try again.');
          }
        }

        if (largeWorkflowUpload && !(wpStoredFile && wpStoredFile.file_url) && libraryAvailable()) {
          throw new Error('The file could not be saved to your WordPress uploads folder. Large pattern files need to be stored there before analysis.');
        }

        setUploadProgress(true, largeWorkflowUpload ? 'Starting analysis…' : 'Uploading…', 32);

        const uploadPayload = {
          file_name: uploadFile.name || 'pattern-upload',
          mime_type: uploadFile.type || 'application/octet-stream',
          file_size: uploadFile.size || 0,
          project_name: projectNameValue,
          craft_type: craftValue,
          project_type: 'uploaded_pattern',
          upload_nonce: preuploadProjectId,
          upload_transport: (wpStoredFile && wpStoredFile.file_url && largeWorkflowUpload) ? 'wordpress_url' : 'inline_data_uri'
        };
        if (fileDataUri) uploadPayload.file_data_uri = fileDataUri;
        if (wpStoredFile && wpStoredFile.file_url) {
          uploadPayload.file_url = wpStoredFile.file_url;
          uploadPayload.source_url = wpStoredFile.file_url;
          uploadPayload.wp_upload_file_url = wpStoredFile.file_url;
          uploadPayload.wp_upload_relative_path = wpStoredFile.relative_path || '';
          uploadPayload.file_extension = wpStoredFile.file_extension || getFileExtension(uploadFile.name || '');
        }

        async function postUpload() {
          const jsonBody = JSON.stringify(uploadPayload);
          const tried = [];

          async function postJson(url, headers, credentials) {
            if (!url || tried.indexOf(url) !== -1) return null;
            tried.push(url);
            try {
              return await fetch(url, {
                method: 'POST',
                credentials: credentials || 'same-origin',
                cache: 'no-store',
                headers: headers,
                body: jsonBody
              });
            } catch (error) {
              if (window.ssDebug === true) console.warn('StitchSense upload route failed:', url, error);
              return null;
            }
          }

          const restResponse = await postJson(restUploadEndpoint, {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-WP-Nonce': wpRestNonce
          }, 'same-origin');
          if (restResponse && restResponse.status !== 404 && restResponse.status !== 405) return restResponse;

          const pluginResponse = await postJson(pluginUploadProxyEndpoint || uploadEndpoint, {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }, 'same-origin');
          if (pluginResponse && pluginResponse.status !== 404 && pluginResponse.status !== 405) return pluginResponse;

          if (directUploadEndpoint) {
            return postJson(directUploadEndpoint, {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }, 'omit');
          }

          return null;
        }

        let response;
        try {
          response = await postUpload();
        } catch (uploadFetchError) {
          throw new Error('Upload request could not be sent. Please check that the StitchSense upload workflow is active.');
        }
        if (!response) {
          throw new Error('Upload request could not be sent. Please check that the StitchSense upload workflow is active.');
        }

        setUploadProgress(true, 'Analysing pattern…', 70);

        let data;
        try {
          data = await ssParseJsonResponse(response);
        } catch (e) {
          throw new Error('Upload service returned an unreadable response.');
        }

        function workflowNeedsInlineUpload(payload) {
          const message = String((payload && (payload.error || payload.message)) || '').toLowerCase();
          return message.indexOf('no file uploaded') !== -1 ||
            message.indexOf('no pattern file') !== -1 ||
            message.indexOf('file_data_uri') !== -1 ||
            message.indexOf('file data') !== -1;
        }

        if ((!response.ok || data.success === false) && largeWorkflowUpload && wpStoredFile && wpStoredFile.file_url && !fileDataUri && workflowNeedsInlineUpload(data)) {
          setUploadProgress(true, 'Retrying analysis with compatibility upload…', 45);
          fileDataUri = await readFileAsDataUrl(uploadFile);
          if (!fileDataUri || fileDataUri.indexOf('base64,') === -1) {
            throw new Error('The file was saved to WordPress, but could not be prepared for the analysis workflow.');
          }
          uploadPayload.file_data_uri = fileDataUri;
          uploadPayload.upload_transport = 'inline_data_uri_retry';
          try {
            response = await postUpload();
            data = await ssParseJsonResponse(response);
          } catch (retryError) {
            throw new Error('The file was saved to WordPress, but the analysis workflow rejected both URL and compatibility upload methods.');
          }
        }

        if (!response.ok || data.success === false) {
          let uploadError = data.error || data.message || ('Upload failed with status ' + response.status + '.');
          if (largeWorkflowUpload && wpStoredFile && wpStoredFile.file_url && !fileDataUri) {
            uploadError += ' The file was saved to WordPress, but the analysis workflow did not accept the WordPress file URL.';
          } else if (largeWorkflowUpload && wpStoredFile && wpStoredFile.file_url && fileDataUri) {
            uploadError += ' The file was saved to WordPress, but the analysis workflow also rejected the compatibility upload.';
          }
          throw new Error(uploadError);
        }

        // Every successful upload is a clean pattern boundary.
        // Clear the previous pattern, chat history and session before storing the new file.
        clearUploadedPatternState({ newSession: true });

        const isLocalPdf = isPdfPatternFile(uploadFile);
        const localPdfUrl = (uploadFile && isLocalPdf) ? URL.createObjectURL(uploadFile) : '';
        const pdfBlobKey = (uploadFile && isLocalPdf) ? (data.project_id ? ('project_' + data.project_id) : (data.file_id ? ('file_' + data.file_id) : ('upload_' + Date.now()))) : '';
        if (uploadFile && isLocalPdf) {
          currentPatternPdfBlob = uploadFile;
          currentPatternPdfTextCacheKey = '';
          currentPatternPdfTextCache = '';
          ssPdfDbPut(pdfBlobKey, uploadFile).catch(function(err){ if (window.ssDebug === true) console.warn('StitchSense PDF cache save failed:', err); });
        }
        uploadedProject = {
          project_id: data.project_id,
          file_id: data.file_id,
          job_id: data.job_id,
          total_chunks: data.total_chunks,
          detected_title: data.detected_title || '',
          detected_design_code: data.detected_design_code || '',
          original_filename: data.original_filename || data.filename || '',
          local_pdf_url: localPdfUrl,
          pdf_blob_key: pdfBlobKey,
          pdf_blob_restored: false,
          file_mime_type: data.mime_type || data.file_mime_type || (uploadFile ? uploadFile.type : ''),
          file_extension: data.file_extension || getFileExtension(data.original_filename || uploadFile.name || ''),
          file_url: data.file_url || data.pdf_url || data.public_url || data.uploaded_file_url || data.pattern_url || data.drive_link || data.drive_web_view_link || data.url || '',
          drive_link: data.drive_link || data.drive_web_view_link || '',
          pattern_summary_html: data.pattern_summary_html || '',
          pattern_summary_text: data.pattern_summary_text || '',
          uploaded_at: new Date().toISOString()
        };

        if (!wpStoredFile && fileDataUri) {
          wpStoredFile = await savePatternFileToWordPress(uploadFile, fileDataUri, data.project_id || data.file_id || '');
        }
        if (wpStoredFile && wpStoredFile.file_url) {
          uploadedProject.file_url = wpStoredFile.file_url;
          uploadedProject.wp_upload_file_url = wpStoredFile.file_url;
          uploadedProject.wp_upload_relative_path = wpStoredFile.relative_path || '';
          uploadedProject.file_extension = wpStoredFile.file_extension || uploadedProject.file_extension;
        }

        persistUploadedProject();

        setUploadProgress(true, 'Summarising pattern…', 90);
        setUploadMessage('success', '<b>Pattern uploaded.</b><br>I’m reading it now and pulling out the useful bits…');

        const initialSummary = await fetchInitialPatternSummary(data);
        uploadedProject.pattern_summary_html = initialSummary.html || initialSummary.text || buildUploadSummaryFallback(data);
        uploadedProject.pattern_summary_text = initialSummary.text || '';
        uploadedProject.pattern_summary_structured = initialSummary.structured || null;
        persistUploadedProject();

        history.push({
          role: 'assistant',
          kind: 'pattern_summary',
          content: uploadedProject.pattern_summary_html
        });

        save();
        const savedPattern = await saveActivePatternToLibrary('upload');
        const savedPatternId = (savedPattern && savedPattern.id) || libraryPatternId || '';

        if (savedPatternId && uploadFile && wpStoredFile && !wpStoredFile.platform_file) {
          const platformSyncedFile = await savePatternFileToWordPress(uploadFile, fileDataUri, data.project_id || data.file_id || '', savedPatternId);
          if (platformSyncedFile && platformSyncedFile.file_url) {
            wpStoredFile = platformSyncedFile;
            uploadedProject.file_url = platformSyncedFile.file_url;
            uploadedProject.wp_upload_file_url = platformSyncedFile.file_url;
            uploadedProject.wp_upload_relative_path = platformSyncedFile.relative_path || uploadedProject.wp_upload_relative_path || '';
            uploadedProject.file_extension = platformSyncedFile.file_extension || uploadedProject.file_extension;
            persistUploadedProject();
          }
        }

        if (savedPatternId) {
          await ensureLibraryChatSession((uploadedProject.detected_title || uploadedProject.original_filename || 'Pattern') + ' chat');
          if (activeChatSessionId) {
            try {
              await libraryRequest('library/chats/' + encodeURIComponent(activeChatSessionId) + '/messages', {
                method: 'POST',
                body: JSON.stringify({ role: 'assistant', kind: 'pattern_summary', content: uploadedProject.pattern_summary_text || uploadedProject.pattern_summary_html, tool_mode: 'pattern_summary' })
              });
            } catch (err) {
              console.warn('StitchSense library summary save failed:', err);
            }
          }
        }
        renderMessages();
        syncSummaryPanel();
        updatePatternViewerButton();
        if (question && !question.value.trim()) { question.value = ssDefaultStepGuidePrompt; question.dispatchEvent(new Event('input', { bubbles: true })); }
        setUploadProgress(true, 'Loaded into chat.', 100);

        setTimeout(function () {
          closeUploadModal();
          const inlineCanvas = qs(root, '[data-ss-upload-canvas]');
          if (inlineCanvas) {
            inlineCanvas.hidden = true;
            inlineCanvas.classList.remove('is-open');
          }
          setUploadProgress(false, '', 0);
          uploadInFlight = false;
          setSelectedFile(null);
          if (fileInput) fileInput.value = '';

          if (uploadOrigin === 'rework') {
            setActivePanel('rework');
            syncReworkUploadedState();
          } else if (uploadOrigin === 'library') {
            setActivePanel('library');
            root.dispatchEvent(new CustomEvent('stitchsense-library-refresh'));
          } else {
            if (question) question.focus();
          }
          uploadOrigin = 'chat';
        }, 900);

      } catch (error) {
        setUploadProgress(false, '', 0);
        setUploadMessage('error', '<b>Upload failed.</b><br>' + escapeHtml(error.message || 'Please try again.'));
        uploadInFlight = false;
        if (uploadSubmit) uploadSubmit.disabled = !selectedPatternFile;
        if (window.ssDebug === true) console.error('StitchSense upload error:', error);
      } finally {
        if (uploadProgress && uploadProgress.hidden) {
          uploadInFlight = false;
          if (uploadSubmit) uploadSubmit.disabled = !selectedPatternFile;
        }
      }
    }

    openUploadButtons.forEach(function (button) {
      if (button.dataset.ssUploadBound === 'true') return;
      button.dataset.ssUploadBound = 'true';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var originAttr = button.getAttribute('data-ss-upload-origin');
        if (originAttr) uploadOrigin = originAttr;
        var wantsChat = button.hasAttribute('data-ss-open-upload-pattern') || button.hasAttribute('data-ss-upload-canvas-toggle');
        if (wantsChat) {
          var targetPanel = uploadOrigin === 'rework' ? 'rework' : 'chat';
          qsa(root, '[data-ss-tab]').forEach(function (tab) {
            tab.classList.toggle('is-active', tab.getAttribute('data-ss-tab') === targetPanel);
          });
          qsa(root, '[data-ss-panel]').forEach(function (panel) {
            panel.classList.toggle('is-active', panel.getAttribute('data-ss-panel') === targetPanel);
          });
          try { localStorage.setItem(storagePrefix + 'active_panel', targetPanel); } catch(e) {}
        }
        openUploadModal();
        var chatCard = qs(root, '.ss-chat-card');
        if (chatCard && typeof chatCard.scrollIntoView === 'function') {
          chatCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    closeUploadButtons.forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        closeUploadModal();
      });
    });

    if (fileDrop && fileInput) {
      fileDrop.addEventListener('click', function () {
        fileInput.click();
      });

      fileDrop.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileInput.click();
        }
      });

      fileInput.addEventListener('change', function () {
        setSelectedFile(fileInput.files && fileInput.files[0] ? fileInput.files[0] : null);
      });

      fileDrop.addEventListener('dragover', function (event) {
        event.preventDefault();
        fileDrop.classList.add('is-dragging');
      });

      fileDrop.addEventListener('dragleave', function () {
        fileDrop.classList.remove('is-dragging');
      });

      fileDrop.addEventListener('drop', function (event) {
        event.preventDefault();
        fileDrop.classList.remove('is-dragging');
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0] ? event.dataTransfer.files[0] : null;
        setSelectedFile(file);
      });
    }

    if (uploadSubmit) {
      uploadSubmit.addEventListener('click', function (event) {
        event.preventDefault();
        uploadSelectedPattern();
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && uploadModal && !uploadModal.hidden) {
        closeUploadModal();
      }
      if (event.key === 'Escape') {
        const viewer = qs(document, '[data-ss-pattern-viewer]');
        if (viewer && !viewer.hidden) closePatternViewer();
      }
    });


    function renderQuickStarts() {
      const quickStartHost = qs(root, '[data-ss-quick-starts]');
      const followupHost = qs(root, '[data-ss-followup-prompts]');
      if (!quickStartHost && !followupHost) return;
      const prompts = buildSmartQuickStarts(history, uploadedProject);
      const html = prompts.map(function (prompt) {
        return '<button type="button" class="ss-chip" data-ss-prompt="' + escapeHtml(prompt) + '">' + escapeHtml(prompt) + '</button>';
      }).join('');
      if (quickStartHost) quickStartHost.innerHTML = html;
      if (followupHost) followupHost.innerHTML = '';
    }

    function renderChatFollowupHtml() {
      const prompts = buildSmartQuickStarts(history, uploadedProject);
      if (!prompts.length) return '';
      return '<div class="ss-chat-followups"><span class="ss-followup-label">Suggested next questions</span><div class="ss-followup-list">' + prompts.map(function(prompt) {
        return '<button type="button" class="ss-chip" data-ss-prompt="' + escapeHtml(prompt) + '">' + escapeHtml(prompt) + '</button>';
      }).join('') + '</div></div>';
    }

    function renderMessages(options) {
      if (!messages) return;
      var renderOptions = options || {};
      if (!history.length) {
        messages.innerHTML = '<div class="ss-empty"><b>Hello, I\'m StitchSense.</b><span>Ask me about stitch instructions, tension, sizing, yarn substitutions or tricky pattern wording.</span></div>';
        return;
      }
      var lastAssistantIndex = -1;
      history.forEach(function (m, index) {
        if (m && m.role !== 'user') lastAssistantIndex = index;
      });
      messages.innerHTML = history.map(function (m, index) {
        const role = m.role === 'user' ? 'user' : 'assistant';
        const label = role === 'user' ? 'You' : 'StitchSense';
        var content = String(m.content || '');
        var contentLooksHtml = /<\s*(article|section|div|p|ul|ol|li|h[1-6]|br|strong|b|em|span|table)\b/i.test(content);
        var body = role === 'assistant'
          ? ((m.kind === 'pattern_summary' && contentLooksHtml) ? content : formatAssistantText(content))
          : escapeHtml(content).replace(/\n/g, '<br>');
        if (role === 'assistant') {
          body = injectStitchRefs(body);
        }
        var messageId = m.id || m.message_id || '';
        var idAttr = messageId ? ' data-ss-chat-message-id="' + escapeHtml(String(messageId)) + '"' : '';
        var copyButton = role === 'assistant'
          ? '<button type="button" class="ss-message-copy" data-ss-copy-message="' + index + '" aria-label="Copy StitchSense response" title="Copy response"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3Zm2 0h5a2 2 0 0 1 2 2v5h2V5h-9v2Zm5 2H5v10h10V9Z"/></svg></button>'
          : '';
        var followups = index === lastAssistantIndex ? '<div class="ss-message assistant ss-followup-message"><div class="ss-bubble">' + renderChatFollowupHtml() + '</div></div>' : '';
        return '<div class="ss-message ' + role + '"' + idAttr + '><div class="ss-bubble">' + copyButton + '<span class="ss-role">' + label + '</span>' + body + '</div></div>' + followups;
      }).join('');
      if (renderOptions.scrollToLatestAssistant && lastAssistantIndex >= 0) {
        requestAnimationFrame(function () {
          var copyControl = qs(messages, '[data-ss-copy-message="' + lastAssistantIndex + '"]');
          var response = copyControl && copyControl.closest('.ss-message');
          if (!response) return;
          messages.scrollTop += response.getBoundingClientRect().top - messages.getBoundingClientRect().top - 10;
        });
      } else {
        messages.scrollTop = messages.scrollHeight;
      }
    }

    function escapeSelectorValue(value) {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
      return String(value).replace(/["\\]/g, '\\$&');
    }

    function scrollToChatMessage(messageId) {
      if (!messages || !messageId) return false;
      var target = qs(messages, '[data-ss-chat-message-id="' + escapeSelectorValue(messageId) + '"]');
      if (!target) return false;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('ss-chat-message-highlight');
      setTimeout(function() {
        try { target.classList.remove('ss-chat-message-highlight'); } catch(e) {}
      }, 1800);
      return true;
    }

    function setLoading(state) {
      if (thinking) thinking.hidden = !state;
      if (send) {
        send.disabled = state;
        send.textContent = state ? '…' : 'Go!';
      }
      if (question) question.disabled = state;
      if (state && thinking) {
        requestAnimationFrame(function () {
          thinking.scrollIntoView({
            block: 'nearest',
            behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
          });
        });
      }
    }

    function copyChatResponse(index, button) {
      var message = history[Number(index)];
      if (!message || message.role === 'user') return;
      var responseText = assistantPlainText(message.content);
      var copyPromise;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        copyPromise = navigator.clipboard.writeText(responseText);
      } else {
        copyPromise = new Promise(function (resolve, reject) {
          var field = document.createElement('textarea');
          field.value = responseText;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.appendChild(field);
          field.select();
          try {
            if (!document.execCommand('copy')) throw new Error('Copy command was rejected');
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            document.body.removeChild(field);
          }
        });
      }
      copyPromise.then(function () {
        if (!button) return;
        button.classList.add('is-copied');
        button.setAttribute('aria-label', 'Response copied');
        button.setAttribute('title', 'Copied!');
        setTimeout(function () {
          button.classList.remove('is-copied');
          button.setAttribute('aria-label', 'Copy StitchSense response');
          button.setAttribute('title', 'Copy response');
        }, 1600);
      }).catch(function (error) {
        console.error('Could not copy StitchSense response:', error);
      });
    }

    function usePrompt(prompt) {
      const chatTab = qs(root, '[data-ss-tab="chat"]');
      if (chatTab) chatTab.click();
      if (question) {
        question.value = prompt + (prompt.endsWith(':') ? '\n' : '');
        question.focus();
      }
    }

    function initUserAccountMenu() {
      var actions = qs(root, '.ss-actions');
      if (!actions || qs(root, '[data-ss-user-menu]')) return;
      var wrap = document.createElement('div');
      wrap.className = 'ss-user-menu';
      wrap.setAttribute('data-ss-user-menu', '');
      if (isUserLoggedIn) {
        var avatar = currentUserAvatar ? '<img src="' + escapeHtml(currentUserAvatar) + '" alt="">' : '<span class="ss-user-initial">' + escapeHtml((currentUserName || 'U').charAt(0)) + '</span>';
        wrap.innerHTML =
          '<button type="button" class="ss-user-menu-toggle" data-ss-user-menu-toggle>' + avatar + '<span>' + escapeHtml(currentUserName || 'My account') + '</span></button>' +
          '<div class="ss-user-menu-popover" data-ss-user-menu-popover hidden>' +
            '<button type="button" data-ss-open-panel="library">My Library</button>' +
            '<a href="' + escapeHtml(accountUrl) + '">My Account</a>' +
            '<button type="button" data-ss-library-scroll-settings>Settings</button>' +
            '<a href="' + escapeHtml(logoutUrl) + '">Log Out</a>' +
          '</div>';
      } else {
        wrap.innerHTML = '<a class="ss-user-login" href="' + escapeHtml(loginUrl) + '">Log In</a>';
      }
      actions.insertBefore(wrap, actions.firstChild);
      var toggle = qs(wrap, '[data-ss-user-menu-toggle]');
      var popover = qs(wrap, '[data-ss-user-menu-popover]');
      if (toggle && popover) {
        toggle.addEventListener('click', function(event) {
          event.preventDefault();
          popover.hidden = !popover.hidden;
        });
        document.addEventListener('click', function(event) {
          if (!wrap.contains(event.target)) popover.hidden = true;
        });
      }
      var settingsBtn = qs(wrap, '[data-ss-library-scroll-settings]');
      if (settingsBtn) settingsBtn.addEventListener('click', function(event) {
        event.preventDefault();
        setActivePanel('library');
        var settings = qs(root, '[data-ss-library-settings]');
        if (settings && settings.scrollIntoView) settings.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }



function syncSummaryPanel() {
      const host = qs(root, '[data-ss-summary-content]');
      if (!host) return;
      if (uploadedProject && (uploadedProject.pattern_summary_html || uploadedProject.pattern_summary_text)) {
        host.classList.remove('ss-feature-empty');
        host.innerHTML = uploadedProject.pattern_summary_html || formatAssistantText(uploadedProject.pattern_summary_text || '');
      } else {
        host.classList.add('ss-feature-empty');
        host.innerHTML = 'Upload a pattern in Pattern Help and I\'ll keep the summary here for quick access.';
      }
    }

    function syncReworkUploadedState() {
      var introCard = qs(root, '.ss-rework-intro-card');
      var reworkQuestion = qs(root, '[data-ss-rework-question]');
      var reworkSend = qs(root, '[data-ss-rework-send]');
      var reworkStatusText = qs(root, '[data-ss-rework-status-text]');
      var reworkUploadBtn = qs(root, '.ss-rework-upload-trigger');
      var reworkPatternSummary = qs(root, '[data-ss-rework-pattern-summary]');

      if (hasLoadedPatternContext()) {
        if (introCard) introCard.classList.add('has-pattern');
        if (reworkQuestion) {
          reworkQuestion.placeholder = 'Describe your desired change, e.g. "Rewrite this DK cardigan for Aran, keeping a 106 cm chest"';
          reworkQuestion.disabled = false;
        }
        if (reworkSend) reworkSend.disabled = false;
        if (reworkStatusText) {
          var title = uploadedProject.detected_title || 'your pattern';
          reworkStatusText.textContent = 'Pattern loaded: ' + title + '. Describe your desired change above.';
        }
        if (reworkUploadBtn) {
          reworkUploadBtn.textContent = 'Change Pattern';
          reworkUploadBtn.style.opacity = '0.7';
        }
        if (reworkPatternSummary) {
          var summaryText = uploadedProject.pattern_summary_text || '';
          if (summaryText) {
            var plainText = summaryText.replace(/[#*`_~\[\]]/g, '').trim();
            reworkPatternSummary.hidden = false;
            reworkPatternSummary.innerHTML = '<div class="ss-rework-summary-label">Uploaded pattern preview</div><div class="ss-rework-summary-text">' + escapeHtml(plainText.slice(0, 300) + (plainText.length > 300 ? '…' : '')) + '</div>';
          }
        }
      } else {
        if (introCard) introCard.classList.remove('has-pattern');
        if (reworkQuestion) {
          reworkQuestion.placeholder = 'Upload a pattern first to begin rewriting…';
          reworkQuestion.disabled = true;
        }
        if (reworkSend) reworkSend.disabled = true;
        if (reworkStatusText) reworkStatusText.textContent = 'No pattern uploaded yet. Use the button above to upload one.';
        if (reworkUploadBtn) {
          reworkUploadBtn.textContent = 'Upload a Pattern';
          reworkUploadBtn.style.opacity = '1';
        }
        if (reworkPatternSummary) reworkPatternSummary.hidden = true;
      }
    }

    function setFeatureResult(selector, html, tone) {
      const el = qs(root, selector);
      if (!el) return;
      el.classList.remove('ss-feature-empty', 'is-success', 'is-warning', 'is-danger', 'is-loading');
      if (tone) el.classList.add('is-' + tone);
      el.innerHTML = html;
    }

    async function refreshPatternSummary() {
      if (!hasLoadedPatternContext()) {
        setFeatureResult('[data-ss-summary-content]', 'Load a pattern first, then I can create a summary.', 'warning');
        return;
      }
      setFeatureResult('[data-ss-summary-content]', 'Refreshing the uploaded pattern summary…', 'loading');
      try {
        const response = await ssPostChat(Object.assign({
            action: 'chat',
            question: ssPatternSummaryPrompt,
            tool_mode: 'pattern_summary',
            session_id: sessionId,
            skill_level: skill ? skill.value : 'beginner'
          }, activePatternContextPayload(true)));
        const data = await ssParseJsonResponse(response);
        if (!response.ok || data.success === false) throw new Error(data.error || 'Summary failed');
        const extracted = ssExtractSummaryPayload(data);
        const structured = ssEnsureSummaryTitle(extracted.structured, uploadedProject && (uploadedProject.detected_title || uploadedProject.title || uploadedProject.original_filename) || '');
        const answerText = extracted.answer || data.answer || 'Pattern summary refreshed.';
        const html = renderPatternSummaryCard(structured, answerText);
        uploadedProject.pattern_summary_html = html;
        uploadedProject.pattern_summary_text = answerText;
        uploadedProject.pattern_summary_structured = structured;
        localStorage.setItem(storagePrefix + 'uploaded_project', JSON.stringify(uploadedProject));
        setFeatureResult('[data-ss-summary-content]', html, 'success');
      } catch (err) {
        console.error('StitchSense summary refresh failed:', err);
        setFeatureResult('[data-ss-summary-content]', 'I could not refresh the summary just now. The existing chat still works, so try again in a moment.', 'danger');
      }
    }

    function renderPatternCheckReport(structured, fallbackText) {
      const report = structured && typeof structured === 'object' ? structured : null;
      if (!report) return formatAssistantText(fallbackText || 'No detailed report returned.');
      const issues = Array.isArray(report.issues_found) ? report.issues_found : [];
      const bits = [];
      const status = report.overall_status ? String(report.overall_status).replace(/_/g, ' ') : 'review complete';
      bits.push('<div class="ss-check-report-card">');
      bits.push('<div class="ss-check-report-head"><span>Checker report</span><h4>' + escapeHtml(status.charAt(0).toUpperCase() + status.slice(1)) + '</h4><p>' + inlineFormat(fallbackText || 'I checked the uploaded pattern for potential issues worth reviewing.') + '</p></div>');
      bits.push('<div class="ss-check-stats"><span><b>' + escapeHtml(String(report.issue_count || issues.length || 0)) + '</b> issues noted</span><span><b>' + escapeHtml(String(report.high_priority_count || 0)) + '</b> high priority</span><span><b>' + escapeHtml(report.confidence_score || 'medium') + '</b> confidence</span></div>');
      function listBlock(label, values, tone) {
        const arr = normaliseList(values);
        if (!arr.length) return '';
        return '<div class="ss-check-list ' + (tone || '') + '"><b>' + escapeHtml(label) + '</b><ul>' + arr.slice(0, 10).map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul></div>';
      }
      bits.push(listBlock('Missing or unclear sections', report.missing_sections, 'is-warning'));
      bits.push(listBlock('Terminology warnings', report.terminology_warnings, 'is-warning'));
      bits.push(listBlock('Stitch-count warnings', report.stitch_count_warnings, 'is-danger'));
      bits.push(listBlock('Size / grading warnings', report.size_grading_warnings, 'is-warning'));
      bits.push(listBlock('Repeat warnings', report.repeat_warnings, 'is-warning'));
      if (issues.length) {
        bits.push('<div class="ss-check-issues"><b>Detailed findings</b>');
        issues.slice(0, 12).forEach(function (issue) {
          const sev = issue.severity || 'info';
          bits.push('<article class="ss-check-issue ss-sev-' + escapeHtml(sev) + '"><div><span>' + escapeHtml(sev) + '</span><h5>' + escapeHtml(issue.category || 'Potential issue') + '</h5></div>' +
            (issue.pattern_excerpt ? '<p><b>Evidence:</b> “' + escapeHtml(issue.pattern_excerpt) + '”</p>' : '') +
            (issue.why_it_matters ? '<p><b>Why it matters:</b> ' + escapeHtml(issue.why_it_matters) + '</p>' : '') +
            (issue.recommended_action ? '<p><b>What to do next:</b> ' + escapeHtml(issue.recommended_action) + '</p>' : '') +
          '</article>');
        });
        bits.push('</div>');
      }
      bits.push(listBlock('Useful questions to ask next', report.suggested_questions_to_ask, ''));
      bits.push('</div>');
      return bits.join('');
    }

    async function runPatternCheck() {
      if (!hasLoadedPatternContext()) {
        setFeatureResult('[data-ss-pattern-check-result]', 'Load a pattern first, then run the checker.', 'warning');
        return;
      }
      setFeatureResult('[data-ss-pattern-check-result]', 'Checking the uploaded pattern for potential issues…', 'loading');
      const checkPrompt = 'Check this uploaded knitting or crochet pattern for potential issues to review. Look for missing gauge/tension, missing yarn quantity, missing needle or hook size, missing abbreviation definitions, UK/US crochet terminology ambiguity, conflicting stitch counts, suspicious repeat maths, row or round sequence gaps, confusing shaping instructions and size grading inconsistencies. Use careful language such as “potential issue” and “worth checking”. Include short evidence only, explain why each point matters, and give a practical next action. Do not invent facts.';
      try {
        const response = await ssPostChat(Object.assign({
            action: 'chat',
            question: checkPrompt,
            session_id: sessionId,
            skill_level: skill ? skill.value : 'beginner',
            answer_mode: 'pattern_priority',
            tool_mode: 'pattern_error_check'
          }, activePatternContextPayload(true)));
        const data = await ssParseJsonResponse(response);
        if (!response.ok || data.success === false) throw new Error(data.error || 'Pattern check failed');
        const structuredReport = data.structured_data || data.pattern_error_check || data.report || null;
        const report = data.answer || 'Pattern check complete.';
        const reportHtml = renderPatternCheckReport(structuredReport, report);
        localStorage.setItem(storagePrefix + 'latest_pattern_check', reportHtml);
        setFeatureResult('[data-ss-pattern-check-result]', reportHtml, 'success');
      } catch (err) {
        console.error('StitchSense pattern checker failed:', err);
        setFeatureResult('[data-ss-pattern-check-result]', 'I could not run the pattern check just now. Please try again in a moment.', 'danger');
      }
    }

    function restorePatternCheck() {
      const saved = localStorage.getItem(storagePrefix + 'latest_pattern_check');
      if (saved) setFeatureResult('[data-ss-pattern-check-result]', formatAssistantText(saved), 'success');
    }


    const SS_CAMERA_MAX_SOURCE_BYTES = 50 * 1024 * 1024;
    const SS_CAMERA_DIRECT_SEND_BYTES = 7 * 1024 * 1024;
    const SS_CAMERA_MAX_EDGE = 2200;
    const SS_CAMERA_JPEG_QUALITY = 0.86;

    function ssFormatBytes(bytes) {
      const n = Number(bytes || 0);
      if (!n) return '0 KB';
      if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';
      return Math.max(1, Math.round(n / 1024)) + ' KB';
    }

    function ssLoadImageForCanvas(file) {
      return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('The image could not be opened by this browser.'));
        };
        img.src = url;
      });
    }

    function ssCanvasToBlob(canvas, type, quality) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
      });
    }

    async function ssPrepareStitchPhoto(file) {
      if (!file) throw new Error('Choose a photo first.');
      if (file.size > SS_CAMERA_MAX_SOURCE_BYTES) {
        throw new Error('That image is over 50 MB. Please choose a smaller photo.');
      }

      const mime = String(file.type || '').toLowerCase();
      const isHeic = /heic|heif/.test(mime) || /\.(heic|heif)$/i.test(file.name || '');

      // Small JPEG/PNG/WebP files can go straight through. HEIC/HEIF is attempted via browser decoding first,
      // because many webhook/vision stacks cannot read it reliably.
      if (!isHeic && file.size <= SS_CAMERA_DIRECT_SEND_BYTES) {
        return { file: file, resized: false, message: 'Photo ready: ' + ssFormatBytes(file.size) + '.' };
      }

      let img;
      try {
        img = await ssLoadImageForCanvas(file);
      } catch (err) {
        if (!isHeic && file.size <= SS_CAMERA_DIRECT_SEND_BYTES) {
          return { file: file, resized: false, message: 'Photo ready: ' + ssFormatBytes(file.size) + '.' };
        }
        throw new Error(isHeic ? 'This browser could not convert the HEIC photo. Please choose JPG/PNG, or set your phone camera to Most Compatible.' : err.message);
      }

      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      if (!width || !height) throw new Error('The image dimensions could not be read.');

      const scale = Math.min(1, SS_CAMERA_MAX_EDGE / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Your browser could not prepare this photo.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const blob = await ssCanvasToBlob(canvas, 'image/jpeg', SS_CAMERA_JPEG_QUALITY);
      if (!blob) throw new Error('Your browser could not optimise this photo.');

      const originalBase = String(file.name || 'stitch-photo').replace(/\.[^.]+$/, '');
      const optimised = new File([blob], originalBase + '-stitchsense.jpg', { type: 'image/jpeg', lastModified: Date.now() });

      return {
        file: optimised,
        resized: true,
        original_size: file.size,
        optimised_size: optimised.size,
        original_width: width,
        original_height: height,
        width: targetWidth,
        height: targetHeight,
        message: 'Photo optimised from ' + ssFormatBytes(file.size) + ' to ' + ssFormatBytes(optimised.size) + ' for analysis.'
      };
    }


    function ssPickImageAnalysisAnswer(data) {
      if (!data || typeof data !== 'object') return '';
      const candidates = [
        data.answer,
        data.analysis,
        data.message,
        data.output,
        data.output_text,
        data.text,
        data.response,
        data.result && data.result.answer,
        data.result && data.result.analysis,
        data.data && data.data.answer,
        data.data && data.data.analysis,
        data.structured_data && data.structured_data.answer,
        data.structured_data && data.structured_data.analysis,
        data.image_analysis && data.image_analysis.answer,
        data.image_analysis && data.image_analysis.analysis
      ];
      if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        candidates.push(data.choices[0].message.content);
      }
      for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) return value.trim();
      }

      const structured = data.structured_data || data.image_analysis || data.result || null;
      if (structured && typeof structured === 'object') {
        const parts = [];
        const addList = function (label, value) {
          if (!value) return;
          if (Array.isArray(value) && value.length) {
            parts.push('**' + label + '**\n' + value.map(function (item) { return '• ' + (typeof item === 'string' ? item : JSON.stringify(item)); }).join('\n'));
          } else if (typeof value === 'string' && value.trim()) {
            parts.push('**' + label + '**\n' + value.trim());
          }
        };
        addList('What I can see', structured.visible_observations || structured.observations || structured.what_i_can_see);
        addList('Possible stitch or technique', structured.likely_stitch_or_technique || structured.stitch_or_technique || structured.technique);
        addList('Possible issues', structured.possible_issues || structured.issues || structured.any_issues);
        addList('What to do next', structured.recommended_next_steps || structured.next_steps || structured.what_to_do_next);
        addList('Photo quality notes', structured.image_quality_notes || structured.photo_quality_notes);
        if (parts.length) return parts.join('\n\n');
      }
      return '';
    }

    function initStitchCamera() {
      const input = qs(root, '[data-ss-stitch-photo]');
      const preview = qs(root, '[data-ss-stitch-photo-preview]');
      const analyse = qs(root, '[data-ss-analyse-stitch-photo]');
      const q = qs(root, '[data-ss-stitch-photo-question]');
      if (q) { q.value = q.value || 'What has gone wrong here?'; }
      let selectedFile = null;
      if (input) {
        input.addEventListener('change', function () {
          selectedFile = input.files && input.files[0] ? input.files[0] : null;
          if (!preview) return;
          if (!selectedFile) {
            preview.innerHTML = 'Preview appears here.';
            return;
          }
          const type = String(selectedFile.type || '').toLowerCase();
          const name = String(selectedFile.name || '').toLowerCase();
          if (!/^image\//i.test(selectedFile.type || '') && !/\.(heic|heif)$/i.test(name)) {
            preview.innerHTML = 'Please choose a JPG, PNG, WebP or HEIC image.';
            selectedFile = null;
            return;
          }
          if (selectedFile.size > SS_CAMERA_MAX_SOURCE_BYTES) {
            preview.innerHTML = 'That image is over 50 MB. Please choose a smaller photo.';
            selectedFile = null;
            return;
          }
          const url = URL.createObjectURL(selectedFile);
          preview.innerHTML = '<img src="' + url + '" alt="Selected stitch photo preview"><p class="ss-mini-copy">Selected: ' + ssFormatBytes(selectedFile.size) + '. Large images will be optimised before analysis.</p>';
        });
      }
      if (analyse) {
        analyse.addEventListener('click', async function () {
          if (!selectedFile) {
            setFeatureResult('[data-ss-stitch-camera-result]', 'Choose a photo first.', 'warning');
            return;
          }
          if (!imageEndpoint) {
            setFeatureResult('[data-ss-stitch-camera-result]', '<b>Image endpoint needed.</b><br>The Stitch Vision UI is ready, but the WordPress image proxy is not configured yet.', 'warning');
            return;
          }
          setFeatureResult('[data-ss-stitch-camera-result]', 'Preparing your photo for analysis…', 'loading');
          try {
            const prepared = await ssPrepareStitchPhoto(selectedFile);
            setFeatureResult('[data-ss-stitch-camera-result]', prepared.message + '<br>Analysing your photo…', 'loading');
            const form = new FormData();
            form.append('action', imageProxyAction);
            form.append('image', prepared.file);
            form.append('original_filename', selectedFile.name || 'stitch-photo');
            form.append('original_size_bytes', String(selectedFile.size || 0));
            form.append('optimised_size_bytes', String(prepared.file.size || 0));
            form.append('image_was_optimised', prepared.resized ? 'true' : 'false');
            if (prepared.width) form.append('optimised_width', String(prepared.width));
            if (prepared.height) form.append('optimised_height', String(prepared.height));
            form.append('question', q ? q.value : 'What has gone wrong here?');
            form.append('session_id', sessionId);
            form.append('skill_level', skill ? skill.value : 'beginner');
            if (uploadedProject && uploadedProject.project_id) form.append('project_id', uploadedProject.project_id);
            if (adminVisionModel) form.append('model', adminVisionModel);
            async function tryImageEndpoint(label, url, useNonce) {
              if (!url) return null;
              try {
                const imageForm = new FormData();
                form.forEach(function(value, key){ imageForm.append(key, value); });
                const headers = useNonce && wpRestNonce ? { 'X-WP-Nonce': wpRestNonce } : {};
                const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers, body: imageForm, cache: 'no-store' });
                if (res && res.status !== 404 && res.status !== 405) return res;
              } catch (e) {}
              return null;
            }
            const response =
              await tryImageEndpoint('local-image', pluginImageProxyEndpoint, false) ||
              await tryImageEndpoint('rest-image', restImageEndpoint, true) ||
              await tryImageEndpoint('admin-ajax-image', imageEndpoint || ssAjaxUrl, true) ||
              await tryImageEndpoint('admin-ajax-image-2', ssAjaxUrl, true);
            if (!response) {
              const imageBase64 = await new Promise(function(resolve, reject) {
                const reader = new FileReader();
                reader.onload = function() { resolve(String(reader.result || '')); };
                reader.onerror = function() { reject(new Error('Could not read photo for upload.')); };
                reader.readAsDataURL(prepared.file);
              });
              const imageQuestion = q ? q.value : 'What has gone wrong here?';
              const chatResponse = await ssPostChat({
                action: 'chat',
                question: imageQuestion,
                tool_mode: 'stitch_image_analysis',
                session_id: sessionId,
                skill_level: skill ? skill.value : 'beginner',
                history: [],
                image_data_uri: imageBase64,
                mime_type: prepared.file.type || 'image/jpeg',
                original_filename: selectedFile.name || 'stitch-photo'
              });
              const chatData = await ssParseJsonResponse(chatResponse);
              if (!chatResponse.ok || !chatData.success) throw new Error(chatData.error || 'Image analysis failed via chat proxy');
              const chatAnswer = ssPickImageAnalysisAnswer(chatData);
              if (!chatAnswer) throw new Error('Image workflow returned success but no analysis text.');
              setFeatureResult('[data-ss-stitch-camera-result]', formatAssistantText(chatAnswer), 'success');
              return;
            }
            const data = await ssParseJsonResponse(response);
            if (!response.ok || data.success === false) throw new Error(data.error || 'Image analysis failed');
            const imageAnswer = ssPickImageAnalysisAnswer(data);
            if (!imageAnswer) throw new Error('Image workflow returned success but no analysis text. Check the final n8n response field is answer, analysis, or structured_data.');
            setFeatureResult('[data-ss-stitch-camera-result]', formatAssistantText(imageAnswer), 'success');
          } catch (err) {
            console.error('StitchSense camera analysis failed:', err);
            setFeatureResult('[data-ss-stitch-camera-result]', 'I could not analyse the photo just now. ' + (err && err.message ? err.message : 'Try a clear JPG/PNG image, or try again in a moment.'), 'danger');
          }
        });
      }
    }

    function detectToolModeForQuestion(text) {
      const q = String(text || '').toLowerCase();
      const hasUploadedPattern = hasLoadedPatternContext();
      if (hasUploadedPattern && /(?:step[\s-]*by[\s-]*step|row[\s-]*by[\s-]*row|round[\s-]*by[\s-]*round|walk\s+me\s+through|full\s+(?:and\s+)?(?:detailed\s+)?(?:(?:row[\s-]*by[\s-]*row|round[\s-]*by[\s-]*round|step[\s-]*by[\s-]*step)\s+)?(?:guide|instructions?|breakdown)|detailed\s+(?:(?:row[\s-]*by[\s-]*row|round[\s-]*by[\s-]*round|step[\s-]*by[\s-]*step)\s+)?(?:guide|instructions?|breakdown)|how\s+do\s+i\s+(?:start|begin|make|work|knit|crochet)|what\s+do\s+i\s+do\s+first|where\s+do\s+i\s+start|guide\s+me\s+through|explain\s+how\s+to\s+make|rework|re-work|rewrite|adjust|adapt|resize|re-size|modify|change\s+(?:the\s+)?(?:pattern|size)|make\s+it\s+(?:fit|larger|smaller)|to\s+suit|my\s+(?:size|sizes|measurements)|based\s+on\s+(?:my\s+)?gauge|using\s+(?:my\s+)?gauge)/i.test(q)) {
        return 'pattern_step_guide';
      }
      // Do not send a non-supported gauge_calculator tool mode to the chat workflow.
      // Gauge maths is handled in-browser; chat keeps the uploaded pattern context available.
      return undefined;
    }

    function questionWantsPatternContext(text, forcedGeneral) {
      if (forcedGeneral || !hasLoadedPatternContext()) return false;
      const q = String(text || '').toLowerCase().trim();
      if (!q) return false;
      const mentionsLoadedPattern = /\b(?:this|that|the|my|uploaded|loaded|saved|ravelry)\s+(?:pattern|project|pdf|design|cardigan|jumper|sweater|shawl|hat|sock|blanket|scarf|top|garment)\b/.test(q);
      const patternWorkflowTerms = /\b(?:row|rows|round|rounds|instruction|instructions|chart|repeat|section|sleeve|yoke|neckline|cast\s+on|bind\s+off|cast\s+off|stitch\s+count|increase|decrease|shaping|size|sizes|sizing|fit|ease|yardage|meterage|metres|meters|materials|needle|hook|gauge|tension|rework|rewrite|resize|adapt|substitute)\b/.test(q);
      const asksDefinition = /^(?:what(?:'s|\s+is|\s+are)|what\s+does|define|explain)\s+[^?]{1,80}\??$/.test(q) && !mentionsLoadedPattern;
      const asksPatternAmount = /\b(?:how\s+(?:much|many)|which|where|when)\b/.test(q) && patternWorkflowTerms;
      if (mentionsLoadedPattern || asksPatternAmount) return true;
      if (asksDefinition) return false;
      return patternWorkflowTerms && /\b(?:it|this|that|there|next|first|last|above|below|make|making|work|working|need|use|using|change|adjust)\b/.test(q);
    }

    async function ask(options) {
      const opts = options || {};
      const text = (question && question.value || '').trim();
      if (!text) return;
      history.push({ role: 'user', content: text });
      save();
      renderMessages();
      question.value = '';
      setLoading(true);
      let chatResponse = null;

      try {
        const detectedToolMode = detectToolModeForQuestion(text);
        const usePatternContext = questionWantsPatternContext(text, opts.generalOnly);
        const baseChatPayload = {
            action: 'chat',
            question: text,
            tool_mode: usePatternContext ? detectedToolMode : undefined,
            session_id: sessionId,
            skill_level: skill ? skill.value : 'beginner',
            history: history.slice(-8)
          };
        const patternContextPayload = await buildPatternChatContextPayload(text, usePatternContext, detectedToolMode);
        chatResponse = await ssPostChat(Object.assign({}, baseChatPayload, {
          answer_mode: usePatternContext && detectedToolMode === 'pattern_step_guide' ? 'pattern_instruction_text' : (usePatternContext ? 'pattern_priority' : 'general_stitch_dictionary')
        }, patternContextPayload));
        let data = await ssParseJsonResponse(chatResponse);
        if ((!chatResponse.ok || data.success === false) && usePatternContext && /returned HTTP 200/i.test(String(data.error || data.message || ''))) {
          chatResponse = await ssPostChat(Object.assign({}, baseChatPayload, {
            tool_mode: undefined,
            answer_mode: 'general_stitch_dictionary'
          }, activePatternContextPayload(false)));
          data = await ssParseJsonResponse(chatResponse);
        }
        if (!chatResponse.ok || data.success === false) throw new Error(data.error || data.message || 'Request failed');
        const assistantAnswer = ssPickChatAnswer(data) || 'Sorry, I could not generate a useful answer this time.';
        history.push({ role: 'assistant', content: assistantAnswer });
        await saveChatPairToLibrary(text, assistantAnswer, detectedToolMode);
        if (uploadedProject && /gauge|tension/i.test(text + ' ' + assistantAnswer)) {
          storeGaugeFromText(assistantAnswer);
        }
      } catch (err) {
        const detail = err && err.message ? String(err.message) : 'Unknown connection error.';
        const routeTrace = (chatResponse && chatResponse.ssDebugAttempts && chatResponse.ssDebugAttempts.length) ? (' Route trace: ' + chatResponse.ssDebugAttempts.join(', ') + '.') : '';
        history.push({ role: 'assistant', content: 'Sorry, StitchSense could not connect just now. Technical detail: ' + detail + routeTrace });
        console.error('StitchSense error:', err);
      } finally {
        save();
        renderMessages({ scrollToLatestAssistant: true });
        renderQuickStarts();
        setLoading(false);
        if (question) question.focus();
      }
    }

    root.addEventListener('click', function (event) {
      const viewBtn = event.target.closest('[data-ss-view-pattern]');
      if (viewBtn && root.contains(viewBtn)) {
        event.preventDefault();
        openPatternViewer();
        return;
      }
    });

    root.addEventListener('click', function (event) {
      const copyBtn = event.target.closest('[data-ss-copy-message]');
      if (!copyBtn || !root.contains(copyBtn)) return;
      event.preventDefault();
      copyChatResponse(copyBtn.getAttribute('data-ss-copy-message'), copyBtn);
    });

    root.addEventListener('click', function (event) {
      const promptBtn = event.target.closest('[data-ss-prompt]');
      if (!promptBtn || !root.contains(promptBtn)) return;
      usePrompt(promptBtn.getAttribute('data-ss-prompt') || promptBtn.textContent || '');
    });


    root.addEventListener('click', function (event) {
      const jumpBtn = event.target.closest('[data-ss-open-panel]');
      if (!jumpBtn || !root.contains(jumpBtn)) return;
      event.preventDefault();
      const panel = jumpBtn.getAttribute('data-ss-open-panel');
      const tabBtn = qs(root, '[data-ss-tab="' + panel + '"]');
      if (tabBtn) tabBtn.click();
    });

    function setActivePanel(tab) {
      const target = tab || 'tools';
      qsa(root, '[data-ss-tab]').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-ss-tab') === target);
      });
      qsa(root, '[data-ss-panel]').forEach(function (panel) {
        panel.classList.toggle('is-active', panel.getAttribute('data-ss-panel') === target);
      });
      try { localStorage.setItem(storagePrefix + 'active_panel', target); } catch (e) {}
    }

    qsa(root, '[data-ss-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setActivePanel(btn.getAttribute('data-ss-tab'));
      });
    });

    try {
      const pendingPanel = localStorage.getItem(storagePrefix + 'pending_active_panel');
      if (pendingPanel) {
        localStorage.removeItem(storagePrefix + 'pending_active_panel');
        setActivePanel(pendingPanel);
      } else {
        const savedPanel = localStorage.getItem(storagePrefix + 'active_panel');
        if (savedPanel) setActivePanel(savedPanel);
      }
    } catch (e) {}


    const summaryRefreshBtn = qs(root, '[data-ss-refresh-summary]');
    if (summaryRefreshBtn) summaryRefreshBtn.addEventListener('click', function(e){ e.preventDefault(); refreshPatternSummary(); });
    const summaryGuideBtn = qs(root, '[data-ss-summary-step-guide]');
    if (summaryGuideBtn) summaryGuideBtn.addEventListener('click', function(e){ e.preventDefault(); usePrompt(ssDefaultStepGuidePrompt); });
    const checkBtn = qs(root, '[data-ss-run-pattern-check]');
    if (checkBtn) checkBtn.addEventListener('click', function(e){ e.preventDefault(); runPatternCheck(); });
    const copyCheckBtn = qs(root, '[data-ss-copy-pattern-check]');
    if (copyCheckBtn) copyCheckBtn.addEventListener('click', function(e){
      e.preventDefault();
      const saved = localStorage.getItem(storagePrefix + 'latest_pattern_check') || '';
      if (saved && navigator.clipboard) navigator.clipboard.writeText(saved);
    });

    var uploadOrigin = 'chat';

    syncSummaryPanel();
    initUserAccountMenu();
    restorePatternCheck();
    initStitchCamera();
    initRework();
    initProjects();
    initLibrary();

    if (send) send.addEventListener('click', ask);
    if (question) {
      question.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          ask();
        }
      });
    }
    if (reset) {
      reset.addEventListener('click', function (event) {
        if (event) event.preventDefault();
        // True clean slate: remove chats, uploaded patterns, summaries, gauge results,
        // quick-tool checklist state, camera outputs and any panel memory for this widget.
        try {
          Object.keys(localStorage).forEach(function (key) {
            if (key.indexOf(storagePrefix) === 0) localStorage.removeItem(key);
          });
        } catch (e) {}
        try {
          if (window.indexedDB && indexedDB.deleteDatabase) indexedDB.deleteDatabase('stitchsense_pattern_files_v1');
        } catch (e) {}
        uploadInFlight = false;
        selectedPatternFile = null;
        if (fileInput) { try { fileInput.value = ''; } catch(e) {} }
        createFreshSession();
        try { localStorage.setItem(storagePrefix + 'active_panel', 'tools'); } catch (e) {}
        window.location.reload();
      });
    }
    if (skill) {
      skill.addEventListener('change', function () { localStorage.setItem(storagePrefix + 'skill', skill.value); });
    }
    updatePatternViewerButton();

    let activeDictType = 'all';
    let activeDictCategory = 'all';
    const dict = qs(root, '[data-ss-dictionary]');
    const dictSearch = qs(root, '[data-ss-stitch-search]');
    const dictCategory = qs(root, '[data-ss-dict-category]');
    const dictCategoryList = qs(root, '[data-ss-dict-category-list]');
    const dictSort = qs(root, '[data-ss-dict-sort]');
    const dictHeading = qs(root, '[data-ss-dict-heading]');
    const dictSubheading = qs(root, '[data-ss-dict-subheading]');
    const dictTotal = qs(root, '[data-ss-dict-total]');

    function normaliseCategoryName(name) {
      return String(name || 'Other').trim() || 'Other';
    }

    function getDictBaseItems() {
      return stitchItems.filter(function (item) {
        return activeDictType === 'all' || item.type === activeDictType;
      });
    }

    function getDictCategories(items) {
      const counts = {};
      items.forEach(function (item) {
        const category = normaliseCategoryName(item.category);
        counts[category] = (counts[category] || 0) + 1;
      });
      return Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); }).map(function (name) {
        return { name: name, count: counts[name] };
      });
    }

    function refreshDictChrome() {
      const baseItems = getDictBaseItems();
      const categories = getDictCategories(baseItems);
      const total = baseItems.length;
      const label = activeDictType === 'knitting' ? 'Knitting' : activeDictType === 'crochet' ? 'Crochet' : 'All';

      if (dictTotal) dictTotal.textContent = String(total);
      if (dictHeading) dictHeading.textContent = label + ' Stitches';
      if (dictSubheading) dictSubheading.textContent = activeDictType === 'all'
        ? 'Browse the full knitting and crochet stitch library.'
        : 'Browse or search the ' + label.toLowerCase() + ' stitch library.';

      if (dictCategory) {
        const previous = activeDictCategory;
        dictCategory.innerHTML = '<option value="all">All Categories</option>' + categories.map(function (cat) {
          return '<option value="' + escapeHtml(cat.name) + '">' + escapeHtml(cat.name) + ' (' + cat.count + ')</option>';
        }).join('');
        activeDictCategory = categories.some(function (cat) { return cat.name === previous; }) ? previous : 'all';
        dictCategory.value = activeDictCategory;
      }

      if (dictCategoryList) {
        dictCategoryList.innerHTML = '<button type="button" class="' + (activeDictCategory === 'all' ? 'is-active' : '') + '" data-ss-dict-category-pill="all"><span>All Categories</span><b>' + total + '</b></button>' +
          categories.map(function (cat) {
            return '<button type="button" class="' + (activeDictCategory === cat.name ? 'is-active' : '') + '" data-ss-dict-category-pill="' + escapeHtml(cat.name) + '"><span>' + escapeHtml(cat.name) + '</span><b>' + cat.count + '</b></button>';
          }).join('');
      }
    }

    function renderDict() {
      if (!dict) return;
      refreshDictChrome();
      const f = String(dictSearch ? dictSearch.value : '').toLowerCase().trim();
      const sortMode = dictSort ? dictSort.value : 'az';
      let filtered = getDictBaseItems().filter(function (item) {
        const haystack = [
          item.type, item.category, item.symbol, item.name, item.abbr, item.uk, item.us,
          item.alt, item.difficulty, item.desc, item.note
        ].join(' ').toLowerCase();
        const categoryOk = activeDictCategory === 'all' || normaliseCategoryName(item.category) === activeDictCategory;
        return categoryOk && (!f || haystack.indexOf(f) !== -1);
      });

      filtered = filtered.slice().sort(function (a, b) {
        if (sortMode === 'za') return String(b.name || '').localeCompare(String(a.name || ''));
        if (sortMode === 'difficulty') return String(a.difficulty || '').localeCompare(String(b.difficulty || '')) || String(a.name || '').localeCompare(String(b.name || ''));
        if (sortMode === 'category') return normaliseCategoryName(a.category).localeCompare(normaliseCategoryName(b.category)) || String(a.name || '').localeCompare(String(b.name || ''));
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      if (!filtered.length) {
        dict.innerHTML = '<div class="ss-dict-empty">No match found. Try searching for an abbreviation, stitch name, UK/US term, or technique.</div>';
        return;
      }

      dict.innerHTML = filtered.map(function (item) {
        const mark = item.symbol || item.abbr || item.visual || '•';
        const askPrompt = 'This is a general Stitch Dictionary question, not a question about the uploaded pattern. Please explain how to create the ' + (item.name || mark) + ' ' + (item.type || '') + ' stitch in clear, detailed, step-by-step UK English. Include what the abbreviation means, when it is used, and any beginner tips. UK/EU term: ' + (item.uk || 'not listed') + '. US term: ' + (item.us || 'not listed') + '.';
        return '<article class="ss-dict-item ss-dict-' + escapeHtml(item.type) + '">' +
          '<div class="ss-dict-card-top">' +
            '<span class="ss-stitch-lozenge" title="Stitch abbreviation">' + escapeHtml(mark) + '</span>' +
          '</div>' +
          '<div class="ss-dict-title"><b>' + escapeHtml(item.name) + '</b><span>' + escapeHtml(item.desc || 'No description available yet.') + '</span></div>' +
          '<div class="ss-dict-facts">' +
            (item.uk ? '<div data-fact="uk"><i>🇬🇧</i><strong>UK/EU:</strong><span>' + escapeHtml(item.uk) + '</span></div>' : '') +
            (item.us ? '<div data-fact="us"><i>🇺🇸</i><strong>US:</strong><span>' + escapeHtml(item.us) + '</span></div>' : '') +
            '<div data-fact="difficulty"><i>🟢</i><strong>Difficulty:</strong><span>' + escapeHtml(item.difficulty || 'Standard') + '</span></div>' +
          '</div>' +
          '<button type="button" class="ss-dict-ask" data-ss-dict-ask="' + escapeHtml(askPrompt) + '" aria-label="Ask StitchSense about ' + escapeHtml(item.name || mark) + '">ASK?</button>' +
        '</article>';
      }).join('');
    }

    qsa(root, '[data-ss-dict-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeDictType = btn.getAttribute('data-ss-dict-type') || 'all';
        activeDictCategory = 'all';
        qsa(root, '[data-ss-dict-type]').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        renderDict();
      });
    });
    if (dictSearch) dictSearch.addEventListener('input', renderDict);
    if (dictCategory) dictCategory.addEventListener('change', function () { activeDictCategory = dictCategory.value || 'all'; renderDict(); });
    if (dictSort) dictSort.addEventListener('change', renderDict);
    if (dictCategoryList) {
      dictCategoryList.addEventListener('click', function (event) {
        const btn = event.target.closest('[data-ss-dict-category-pill]');
        if (!btn) return;
        activeDictCategory = btn.getAttribute('data-ss-dict-category-pill') || 'all';
        if (dictCategory) dictCategory.value = activeDictCategory;
        renderDict();
      });
    }

    if (dict) {
      dict.addEventListener('click', function (event) {
        const askBtn = event.target.closest('[data-ss-dict-ask]');
        if (!askBtn || !dict.contains(askBtn)) return;
        event.preventDefault();
        const prompt = askBtn.getAttribute('data-ss-dict-ask') || '';
        const chatTab = qs(root, '[data-ss-tab="chat"]');
        if (chatTab) chatTab.click();
        if (question) {
          question.value = prompt;
          question.focus();
        }
        ask({ generalOnly: true });
      });
    }

    renderDict();

    let lastGaugeCalculation = null;

    function ssNum(sel) {
      const el = qs(root, sel);
      if (!el) return 0;
      const value = parseFloat(String(el.value || '').replace(',', '.'));
      return Number.isFinite(value) ? value : 0;
    }

    function ssVal(sel) {
      const el = qs(root, sel);
      return el ? String(el.value || '').trim() : '';
    }

    function setGaugeValue(sel, value) {
      const el = qs(root, sel);
      if (el && value !== undefined && value !== null) el.value = value;
    }


    function getSharedPatternMetadata() {
      const meta = (uploadedProject && (uploadedProject.shared_pattern_metadata || uploadedProject.pattern_metadata)) || {};
      const structured = uploadedProject && (uploadedProject.pattern_summary_structured || uploadedProject.structured_data || uploadedProject.pattern_summary) || {};
      const merged = Object.assign({}, structured || {}, meta || {});
      if (!merged.gauge && meta.gauge) merged.gauge = meta.gauge;
      return merged;
    }

    function persistSharedPatternMetadata(patch) {
      if (!uploadedProject) return;
      const current = uploadedProject.shared_pattern_metadata || uploadedProject.pattern_metadata || {};
      uploadedProject.shared_pattern_metadata = Object.assign({}, current, patch || {}, { updated_at: new Date().toISOString() });
      uploadedProject.pattern_metadata = uploadedProject.shared_pattern_metadata;
      persistUploadedProject();
      try { window.StitchSensePatternData = uploadedProject.shared_pattern_metadata; } catch (e) {}
    }

    function flattenGaugeSource(value) {
      if (!value) return '';
      if (typeof value === 'string' || typeof value === 'number') return String(value);
      if (Array.isArray(value)) return value.map(flattenGaugeSource).join(' ');
      if (typeof value === 'object') {
        return Object.keys(value).map(function(k){ return k + ': ' + flattenGaugeSource(value[k]); }).join(' ');
      }
      return '';
    }

    function getGaugeMeasureCm() {
      const unit = ssVal('[data-ss-gauge-unit]') || '10cm';
      if (unit === '4in') return 10.16;
      if (unit === 'custom') return Math.max(0.1, ssNum('[data-ss-gauge-custom-measure]') || 10);
      return 10;
    }

    function roundGauge(n, places) {
      const p = Math.pow(10, places || 1);
      return Math.round((Number(n) || 0) * p) / p;
    }

    function getGaugeTolerances() {
      const good = Math.max(0, ssNum('[data-ss-gauge-good-tolerance]') || 3);
      const noticeable = Math.max(good + 0.5, ssNum('[data-ss-gauge-noticeable-tolerance]') || 8);
      const major = Math.max(noticeable + 0.5, ssNum('[data-ss-gauge-major-tolerance]') || 15);
      return { good: good, noticeable: noticeable, major: major };
    }

    function gaugeStatus(diff) {
      const t = getGaugeTolerances();
      const abs = Math.abs(diff);
      if (abs <= t.good) return 'good_match';
      if (abs <= t.noticeable) return 'minor_mismatch';
      if (abs <= t.major) return 'noticeable_mismatch';
      return 'major_mismatch';
    }

    function gaugeStatusLabel(status, dimensional) {
      if (status === 'good_match') return 'Good match';
      if (status === 'minor_mismatch') return dimensional ? 'Slight size mismatch' : 'Slight mismatch';
      if (status === 'noticeable_mismatch') return dimensional ? 'Noticeable size mismatch' : 'Noticeable mismatch';
      return dimensional ? 'Major size mismatch' : 'Major mismatch';
    }

    function inferGaugeProjectType() {
      const explicit = ssVal('[data-ss-project-type]');
      if (explicit && explicit !== 'unknown') return explicit;
      const meta = getSharedPatternMetadata();
      const text = flattenGaugeSource(meta).toLowerCase();
      if (/cardigan|jumper|sweater|sock|hat|mitten|glove|garment|bust|chest|sleeve|armhole/.test(text)) return 'garment';
      if (/amigurumi|toy|stuffed|softie/.test(text)) return 'toy_amigurumi';
      if (/motif|granny|square|block/.test(text)) return 'motif';
      if (/scarf|shawl|wrap|blanket|throw/.test(text)) return 'blanket_scarf';
      return 'unknown';
    }

    function gaugeImpactText(status, projectType) {
      if (status === 'good_match') return 'This is close enough for most projects. Check the fabric feel before committing, because maths cannot judge drape.';
      if (projectType === 'garment') return 'Because this looks like a fitted item, ignoring this gauge difference can change the final fit. Swatch again before starting the full project.';
      if (projectType === 'toy_amigurumi') return 'For toys or amigurumi, loose gauge can expose stuffing and change the shape. Aim for a firm fabric even if exact row gauge matters less.';
      if (projectType === 'blanket_scarf') return 'For scarves, shawls and blankets this may be acceptable if you like the fabric, but the finished size and yarn use can change.';
      if (projectType === 'motif') return 'For motifs or blocks, small differences multiply across joins. Match the block size before making a pile of them.';
      return 'Ignoring gauge can change the finished size, fabric feel and yarn usage. Swatching again is cheaper than frogging half a project.';
    }

    function renderGaugeResultCard(calc) {
      if (!calc) return '';
      const dimensional = calc.gauge_type === 'finished_block_or_motif_measurement';
      const status = calc.result_status || 'good_match';
      const warnings = normaliseList(calc.warnings);
      const projectType = calc.project_type || inferGaugeProjectType();
      const rows = [];
      if (dimensional) {
        rows.push('Pattern block width: ' + calc.target_width_cm + ' cm');
        rows.push('Your block width: ' + calc.actual_width_cm + ' cm (' + (calc.width_difference_percent >= 0 ? '+' : '') + calc.width_difference_percent + '%)');
        if (calc.height_difference_percent !== null && calc.height_difference_percent !== undefined) rows.push('Height difference: ' + (calc.height_difference_percent >= 0 ? '+' : '') + calc.height_difference_percent + '%');
      } else {
        rows.push('Target stitch gauge: ' + calc.target_stitch_gauge + ' sts per 10 cm');
        rows.push('Your stitch gauge: ' + calc.actual_stitch_gauge + ' sts per 10 cm (' + calc.stitch_difference_percent + '%)');
        if (calc.row_difference_percent !== null && calc.row_difference_percent !== undefined) rows.push('Your row gauge difference: ' + calc.row_difference_percent + '%');
        if (calc.estimated_width_change !== null && calc.estimated_width_change !== undefined) rows.push('Estimated width change: ' + (calc.estimated_width_change >= 0 ? '+' : '') + calc.estimated_width_change + ' cm');
        if (calc.estimated_length_change !== null && calc.estimated_length_change !== undefined) rows.push('Estimated length change: ' + (calc.estimated_length_change >= 0 ? '+' : '') + calc.estimated_length_change + ' cm');
      }
      return '<div class="ss-gauge-output ss-gauge-output-v7412">' +
        '<b>' + escapeHtml(gaugeStatusLabel(status, dimensional)) + '</b>' +
        '<p>' + escapeHtml(calc.plain_english_explanation || '') + '</p>' +
        '<p><b>Needle/hook advice:</b> ' + escapeHtml(calc.needle_hook_recommendation || '') + '</p>' +
        '<p><b>If you ignore it:</b> ' + escapeHtml(gaugeImpactText(status, projectType)) + '</p>' +
        '<ul>' + rows.map(function(row){ return '<li>' + escapeHtml(row) + '</li>'; }).join('') + '</ul>' +
        (warnings.length ? '<div class="ss-summary-warning"><b>Worth checking:</b><ul>' + warnings.map(function(w){ return '<li>' + escapeHtml(w) + '</li>'; }).join('') + '</ul></div>' : '') +
      '</div>';
    }


    function setGaugeResultTone(status) {
      const shell = qs(root, '.ss-gauge-result-shell-v735');
      if (!shell) return;
      shell.classList.remove('ss-gauge-tone-good', 'ss-gauge-tone-warning', 'ss-gauge-tone-bad');
      if (!status) return;
      if (status === 'good_match') {
        shell.classList.add('ss-gauge-tone-good');
      } else {
        // v7.3.10: any mismatch should look like a problem state, not a success state.
        // The wording can still say "slight" or "noticeable", but the visual cue must be red/pink.
        shell.classList.add('ss-gauge-tone-bad');
      }
    }



    function gaugeSeverityRank(status) {
      return status === 'major_mismatch' ? 3 : status === 'noticeable_mismatch' ? 2 : status === 'minor_mismatch' ? 1 : 0;
    }

    function worstGaugeStatus(a, b) {
      return gaugeSeverityRank(a) >= gaugeSeverityRank(b) ? a : b;
    }

    function setGaugeMode(mode, parsed) {
      const calc = qs(root, '[data-ss-gauge-calculator]');
      const note = qs(root, '[data-ss-gauge-mode-note]');
      const patternHelp = qs(root, '[data-ss-gauge-pattern-help]');
      const swatchHelp = qs(root, '[data-ss-gauge-swatch-help]');
      const advSummary = qs(root, '[data-ss-advanced-summary]');
      if (!calc) return;
      calc.classList.remove('ss-gauge-mode-stitch-row', 'ss-gauge-mode-dimension');
      if (mode === 'dimension') {
        calc.classList.add('ss-gauge-mode-dimension');
        if (note) note.innerHTML = '<b>Finished block gauge detected.</b> This pattern measures the finished block/motif size, so the useful test is your completed block width and height — not stitches per 10 cm.';
        if (patternHelp) patternHelp.textContent = 'This pattern uses a finished block measurement, so stitch/row target fields are not required.';
        if (swatchHelp) swatchHelp.textContent = 'For this pattern, measure your finished block width and height after working it as instructed.';
        if (advSummary) advSummary.textContent = 'Block / motif size check';
      } else if (mode === 'stitch_row') {
        calc.classList.add('ss-gauge-mode-stitch-row');
        if (note) note.innerHTML = '<b>Stitch gauge detected.</b> Add your swatch count over the same measurement and I’ll compare it with the pattern.';
        if (patternHelp) patternHelp.textContent = 'Target tension from the pattern.';
        if (swatchHelp) swatchHelp.textContent = 'Count stitches and rows across the same measurement.';
        if (advSummary) advSummary.textContent = 'Optional size check';
      } else {
        if (note) note.textContent = 'Use stitch/row gauge when the pattern gives stitches per 10 cm or 4 inches. If the pattern gives a finished block or motif size, use the block-size fields below.';
        if (patternHelp) patternHelp.textContent = 'Target tension from the pattern.';
        if (swatchHelp) swatchHelp.textContent = 'Count stitches and rows across the same measurement.';
        if (advSummary) advSummary.textContent = 'Optional size check';
      }
    }

    function extractNeedleHookAndYarn(text) {
      const raw = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const out = { pattern_tool_size: '', yarn_weight: '', craft_type: '' };
      const tool = raw.match(/(?:knitting\s+needles?|needles?|crochet\s+hook|hook)[^\.\n;]{0,80}?(?:size\s*)?(?:[A-Z]-?\d+\s*)?(?:\[\s*)?(\d+(?:\.\d+)?)\s*mm/i)
        || raw.match(/(?:size\s*)?(?:[A-Z]-?\d+\s*)?\[\s*(\d+(?:\.\d+)?)\s*mm\s*\]/i);
      if (tool) out.pattern_tool_size = tool[1] + ' mm';
      if (/knitting\s+needles?|cast\s+on|knit|purl/i.test(raw)) out.craft_type = 'knitting';
      if (/crochet\s+hook|single\s+crochet|\bsc\b|chain\b/i.test(raw) && !out.craft_type) out.craft_type = 'crochet';
      const yarnName = raw.match(/Lion Brand[^\.\n;]{0,90}?(?:Yarn|Wool|Fishermen's Wool|Fishermen’s Wool)/i)
        || raw.match(/(?:yarn|wool)\s*:\s*([^\.\n;]{3,90})/i);
      const strands = raw.match(/(?:with\s*)?(\d+)\s+strands?\s+(?:of\s+yarn\s+)?held\s+(?:tog|together)/i);
      const yarnBits = [];
      if (yarnName) yarnBits.push(yarnName[0].replace(/^yarn\s*:\s*/i, '').trim());
      if (strands) yarnBits.push(strands[1] + ' strands held together');
      if (yarnBits.length) out.yarn_weight = yarnBits.join(', ');
      return out;
    }

    function parseMixedNumber(value) {
      const text = String(value || '').trim();
      const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
      if (mixed) return parseFloat(mixed[1]) + (parseFloat(mixed[2]) / Math.max(1, parseFloat(mixed[3])));
      const frac = text.match(/^(\d+)\/(\d+)$/);
      if (frac) return parseFloat(frac[1]) / Math.max(1, parseFloat(frac[2]));
      const n = parseFloat(text.replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    }

    function inchesToCm(value) {
      return roundGauge((Number(value) || 0) * 2.54, 1);
    }

    function parseGaugeFromText(text) {
      const raw = String(text || '');
      const compact = raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const meta = getSharedPatternMetadata();
      const metaGauge = meta && meta.gauge && typeof meta.gauge === 'object' ? meta.gauge : null;
      let stitches = metaGauge ? parseFloat(metaGauge.stitches || metaGauge.stitch_count || metaGauge.target_stitches || metaGauge.sts || 0) : 0;
      let rows = metaGauge ? parseFloat(metaGauge.rows || metaGauge.rounds || metaGauge.row_count || metaGauge.target_rows || 0) : 0;
      let unit = metaGauge && /4\s*(?:in|inch|inches|")/i.test(flattenGaugeSource(metaGauge)) ? '4in' : '10cm';
      let widthCm = metaGauge ? parseFloat(metaGauge.width_cm || metaGauge.target_width_cm || metaGauge.block_width_cm || 0) : 0;
      let heightCm = metaGauge ? parseFloat(metaGauge.height_cm || metaGauge.target_height_cm || metaGauge.block_height_cm || 0) : 0;
      let gaugeType = stitches ? 'stitch_row' : '';

      const patterns = [
        /(\d+(?:\.\d+)?)\s*(?:sts?|stitches?)\s*(?:and|,|\/|\+)?\s*(\d+(?:\.\d+)?)\s*(?:rows?|rounds?)\s*(?:to|over|in|per)?\s*(?:10\s*cm|4\s*(?:in|inch|inches|"))/i,
        /(\d+(?:\.\d+)?)\s*(?:sts?|stitches?).{0,55}?(\d+(?:\.\d+)?)\s*(?:rows?|rounds?).{0,35}?(?:10\s*cm|4\s*(?:in|inch|inches|"))/i,
        /(?:10\s*cm|4\s*(?:in|inch|inches|")).{0,55}?(\d+(?:\.\d+)?)\s*(?:sts?|stitches?).{0,55}?(\d+(?:\.\d+)?)\s*(?:rows?|rounds?)/i,
        /gauge|tension/i
      ];

      let match = null;
      for (let i = 0; i < patterns.length - 1; i++) {
        match = compact.match(patterns[i]);
        if (match) break;
      }
      if (match) {
        stitches = parseFloat(match[1]) || stitches;
        rows = parseFloat(match[2]) || rows;
        gaugeType = 'stitch_row';
      }

      const stitchOnly = compact.match(/(\d+(?:\.\d+)?)\s*(?:sts?|stitches?)\s*(?:to|over|in|per)?\s*(?:10\s*cm|4\s*(?:in|inch|inches|"))/i)
        || compact.match(/(?:10\s*cm|4\s*(?:in|inch|inches|")).{0,45}?(\d+(?:\.\d+)?)\s*(?:sts?|stitches?)/i);
      if (!stitches && stitchOnly) { stitches = parseFloat(stitchOnly[1]) || 0; gaugeType = 'stitch_row'; }
      if (/4\s*(?:in|inch|inches|")/i.test(compact)) unit = '4in';

      // Some patterns do not give stitch/row tension. They give a finished motif/block size instead,
      // e.g. "One block measures about 17 1/2 x 18 1/2 in. (44.5 x 47 cm)".
      // That is still usable for the calculator, but it must be treated as dimensional gauge.
      const cmPair = compact.match(/(\d+(?:[\.,]\d+)?)\s*(?:cm|centimetres?)\s*(?:x|×|by)\s*(\d+(?:[\.,]\d+)?)\s*(?:cm|centimetres?)/i)
        || compact.match(/(?:\(|\b)(\d+(?:[\.,]\d+)?)\s*(?:x|×|by)\s*(\d+(?:[\.,]\d+)?)\s*cm(?:\)|\b)/i);
      if (cmPair) {
        widthCm = parseFloat(String(cmPair[1]).replace(',', '.')) || widthCm;
        heightCm = parseFloat(String(cmPair[2]).replace(',', '.')) || heightCm;
        if (!stitches) gaugeType = 'dimension';
      }

      if (!widthCm || !heightCm) {
        const inchNum = '(?:\\d+(?:\\.\\d+)?|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+)';
        const inchRe = new RegExp('(' + inchNum + ')\\s*(?:x|×|by)\\s*(' + inchNum + ')\\s*(?:in|inch|inches|")', 'i');
        const inchPair = compact.match(inchRe);
        if (inchPair) {
          widthCm = widthCm || inchesToCm(parseMixedNumber(inchPair[1]));
          heightCm = heightCm || inchesToCm(parseMixedNumber(inchPair[2]));
          if (!stitches) gaugeType = 'dimension';
        }
      }

      return {
        stitches: stitches || 0,
        rows: rows || 0,
        unit: unit || '10cm',
        gauge_type: gaugeType || (widthCm && heightCm ? 'dimension' : ''),
        width_cm: widthCm || 0,
        height_cm: heightCm || 0,
        raw: compact
      };
    }

    function getUploadedPatternGaugeText(extraText) {
      const summary = uploadedProject && (uploadedProject.pattern_summary_structured || uploadedProject.structured_data || uploadedProject.pattern_summary);
      const meta = getSharedPatternMetadata();
      const bits = [];
      bits.push(flattenGaugeSource(meta));
      if (summary) {
        bits.push(summary.gauge_tension || summary.gauge || summary.tension || '');
        bits.push(Array.isArray(summary.tools_required) ? summary.tools_required.join(' ') : (summary.tools_required || ''));
        bits.push(Array.isArray(summary.yarn_requirements) ? summary.yarn_requirements.join(' ') : (summary.yarn_requirements || ''));
      }
      bits.push(uploadedProject && (uploadedProject.pattern_summary_text || uploadedProject.pattern_summary_html || ''));
      try {
        (history || []).slice(-8).forEach(function(m){
          if (m && m.role === 'assistant' && /gauge|tension|sts|stitches|rows|rounds|10\s*cm|4\s*(?:in|inch|inches|")|block|motif|\d+(?:[\.,]\d+)?\s*(?:x|×|by)\s*\d+(?:[\.,]\d+)?\s*cm/i.test(String(m.content || ''))) bits.push(m.content);
        });
      } catch (e) {}
      if (extraText) bits.push(extraText);
      return bits.filter(Boolean).join(' ');
    }

    function storeGaugeFromText(text) {
      const parsed = parseGaugeFromText(text);
      if (uploadedProject && parsed && (parsed.stitches || (parsed.width_cm && parsed.height_cm))) {
        persistSharedPatternMetadata({
          gauge: {
            type: parsed.gauge_type || (parsed.stitches ? 'stitch_row' : 'dimension'),
            stitches: parsed.stitches || null,
            rows: parsed.rows || null,
            unit: parsed.unit || '10cm',
            width_cm: parsed.width_cm || null,
            height_cm: parsed.height_cm || null,
            source: 'chat_or_pattern_context',
            raw: String(text || '').slice(0, 800)
          }
        });
      }
      return parsed;
    }

    async function fetchGaugeFromUploadedPattern() {
      if (!uploadedProject || !uploadedProject.project_id) return null;
      const response = await ssPostChat({
          action: 'chat',
          question: 'Find the exact gauge or tension for this uploaded pattern. Return the actual gauge/tension wording. If it is stitch and row gauge, include stitches, rows/rounds and whether measured over 10 cm or 4 inches. If it is finished block, motif or square gauge, include the finished width and height in inches and/or cm. Keep the answer short and factual.',
          session_id: sessionId,
          skill_level: skill ? skill.value : 'beginner',
          history: [],
          project_id: uploadedProject.project_id,
          file_id: uploadedProject.file_id || undefined,
          job_id: uploadedProject.job_id || undefined,
          pattern_available: true
        });
      const data = await ssParseJsonResponse(response);
      if (!response.ok || data.success === false) throw new Error(data.error || 'Gauge lookup failed');
      const answer = data.answer || '';
      return storeGaugeFromText(answer);
    }

    function calculateGauge() {
      const measureCm = getGaugeMeasureCm();
      const targetStitches = ssNum('[data-ss-target-stitches]');
      const targetRows = ssNum('[data-ss-target-rows]');
      const actualStitches = ssNum('[data-ss-actual-stitches]');
      const actualRows = ssNum('[data-ss-actual-rows]');
      const stitchCount = ssNum('[data-ss-pattern-stitch-count]');
      const rowCount = ssNum('[data-ss-pattern-row-count]');
      const patternWidthCm = ssNum('[data-ss-pattern-width-cm]');
      const patternHeightCm = ssNum('[data-ss-pattern-height-cm]');
      const actualWidthCm = ssNum('[data-ss-actual-width-cm]');
      const actualHeightCm = ssNum('[data-ss-actual-height-cm]');
      const result = qs(root, '[data-ss-gauge-result]');
      const explain = qs(root, '[data-ss-explain-gauge]');

      if (!targetStitches || !actualStitches) {
        if (patternWidthCm && actualWidthCm) {
          const widthDiff = ((actualWidthCm - patternWidthCm) / patternWidthCm) * 100;
          const hasHeight = Boolean(patternHeightCm && actualHeightCm);
          const heightDiff = hasHeight ? ((actualHeightCm - patternHeightCm) / patternHeightCm) * 100 : null;
          const absWidth = Math.abs(widthDiff);
          const absHeight = hasHeight ? Math.abs(heightDiff) : 0;
          const maxDimensionalDiff = Math.max(absWidth, absHeight);
          const status = gaugeStatus(maxDimensionalDiff);
          const statusLabel = gaugeStatusLabel(status, true);
          const fitText = widthDiff > 3
            ? 'Your finished block/motif is coming out larger than the pattern measurement, so your tension is looser overall.'
            : widthDiff < -3
              ? 'Your finished block/motif is coming out smaller than the pattern measurement, so your tension is tighter overall.'
              : 'Your finished block/motif is close to the pattern measurement.';
          const recommendation = widthDiff > 3
            ? 'Try a smaller needle/hook or work a little tighter, then measure another block.'
            : widthDiff < -3
              ? 'Try a larger needle/hook or relax your tension slightly, then measure another block.'
              : 'Keep this needle/hook size unless the fabric feels wrong.';
          lastGaugeCalculation = {
            craft_type: ssVal('[data-ss-gauge-craft]') || 'unsure',
            project_type: inferGaugeProjectType(),
            gauge_type: 'finished_block_or_motif_measurement',
            target_width_cm: roundGauge(patternWidthCm, 1),
            actual_width_cm: roundGauge(actualWidthCm, 1),
            width_difference_percent: roundGauge(widthDiff, 1),
            target_height_cm: patternHeightCm ? roundGauge(patternHeightCm, 1) : null,
            actual_height_cm: actualHeightCm ? roundGauge(actualHeightCm, 1) : null,
            height_difference_percent: hasHeight ? roundGauge(heightDiff, 1) : null,
            result_status: status,
            needle_hook_recommendation: recommendation,
            plain_english_explanation: fitText,
            next_swatch_action: recommendation,
            pattern_needle_hook: ssVal('[data-ss-pattern-tool-size]') || null,
            current_needle_hook: ssVal('[data-ss-current-tool-size]') || null,
            yarn_weight: ssVal('[data-ss-yarn-weight]') || null,
            warnings: hasHeight ? [] : ['Height was not checked because one of the height measurements is missing.']
          };
          localStorage.setItem(storagePrefix + 'latest_gauge_calculation', JSON.stringify(lastGaugeCalculation));
          setGaugeResultTone(status);
          if (result) {
            result.innerHTML = renderGaugeResultCard(lastGaugeCalculation);
          }
          if (explain) explain.hidden = false;
          return lastGaugeCalculation;
        }
        setGaugeResultTone(null);
        if (result) result.innerHTML = '<b>More information needed.</b><br>For stitch gauge, add target stitches and your swatch stitches. For block/motif gauge, add the pattern block width and your measured block width.';
        if (explain) explain.hidden = true;
        return null;
      }

      const targetStitchGauge = targetStitches / measureCm * 10;
      const actualStitchGauge = actualStitches / measureCm * 10;
      const stitchDiff = ((actualStitchGauge - targetStitchGauge) / targetStitchGauge) * 100;
      const hasRows = Boolean(targetRows && actualRows);
      const targetRowGauge = hasRows ? targetRows / measureCm * 10 : 0;
      const actualRowGauge = hasRows ? actualRows / measureCm * 10 : 0;
      const rowDiff = hasRows ? ((actualRowGauge - targetRowGauge) / targetRowGauge) * 100 : 0;

      const status = worstGaugeStatus(gaugeStatus(stitchDiff), hasRows ? gaugeStatus(rowDiff) : 'good_match');
      const tolerance = getGaugeTolerances();
      const tooMany = stitchDiff > tolerance.good;
      const tooFew = stitchDiff < -tolerance.good;
      const recommendation = tooMany
        ? 'Try a larger needle/hook and swatch again.'
        : tooFew
          ? 'Try a smaller needle/hook and swatch again.'
          : 'Your stitch gauge is close. Keep this needle/hook size unless the fabric feels wrong.';
      const fitText = tooMany
        ? 'Your stitches are smaller/tighter than the pattern target, so the finished item may come out smaller.'
        : tooFew
          ? 'Your stitches are larger/looser than the pattern target, so the finished item may come out bigger.'
          : 'Your stitch gauge is within a sensible tolerance.';

      const targetWidth = stitchCount ? stitchCount / targetStitchGauge * 10 : 0;
      const actualWidth = stitchCount ? stitchCount / actualStitchGauge * 10 : 0;
      const widthChange = stitchCount ? actualWidth - targetWidth : 0;
      const targetLength = (hasRows && rowCount) ? rowCount / targetRowGauge * 10 : 0;
      const actualLength = (hasRows && rowCount) ? rowCount / actualRowGauge * 10 : 0;
      const lengthChange = (hasRows && rowCount) ? actualLength - targetLength : 0;
      const warnings = [];
      if (Math.abs(stitchDiff) > tolerance.major) warnings.push('Major stitch-gauge mismatch. Do not start the full project until you swatch again.');
      if (hasRows && Math.abs(rowDiff) > tolerance.noticeable) warnings.push('Row/round gauge is noticeably different. Length shaping may need closer checking.');
      if (!hasRows) warnings.push('Row/round gauge was not calculated because row values are missing.');

      lastGaugeCalculation = {
        craft_type: ssVal('[data-ss-gauge-craft]') || 'unsure',
        project_type: inferGaugeProjectType(),
        target_stitch_gauge: roundGauge(targetStitchGauge, 2),
        actual_stitch_gauge: roundGauge(actualStitchGauge, 2),
        stitch_difference_percent: roundGauge(stitchDiff, 1),
        target_row_gauge: hasRows ? roundGauge(targetRowGauge, 2) : null,
        actual_row_gauge: hasRows ? roundGauge(actualRowGauge, 2) : null,
        row_difference_percent: hasRows ? roundGauge(rowDiff, 1) : null,
        result_status: status,
        needle_hook_recommendation: recommendation,
        estimated_width_change: stitchCount ? roundGauge(widthChange, 1) : null,
        estimated_length_change: (hasRows && rowCount) ? roundGauge(lengthChange, 1) : null,
        plain_english_explanation: fitText,
        next_swatch_action: recommendation,
        pattern_needle_hook: ssVal('[data-ss-pattern-tool-size]') || null,
        current_needle_hook: ssVal('[data-ss-current-tool-size]') || null,
        yarn_weight: ssVal('[data-ss-yarn-weight]') || null,
        warnings: warnings
      };
      localStorage.setItem(storagePrefix + 'latest_gauge_calculation', JSON.stringify(lastGaugeCalculation));
      setGaugeResultTone(status);

      if (result) {
        result.innerHTML = renderGaugeResultCard(lastGaugeCalculation);
      }
      if (explain) explain.hidden = false;
      return lastGaugeCalculation;
    }

    function initGaugeCalculator() {
      const unit = qs(root, '[data-ss-gauge-unit]');
      const custom = qs(root, '.ss-custom-measure');
      const calcBtn = qs(root, '[data-ss-calc-gauge]');
      const resetBtn = qs(root, '[data-ss-reset-gauge]');
      const usePatternBtn = qs(root, '[data-ss-use-pattern-gauge]');
      const explainBtn = qs(root, '[data-ss-explain-gauge]');
      const result = qs(root, '[data-ss-gauge-result]');
      const saved = localStorage.getItem(storagePrefix + 'latest_gauge_calculation');
      if (saved && result) {
        try {
          lastGaugeCalculation = JSON.parse(saved);
          result.innerHTML = renderGaugeResultCard(lastGaugeCalculation);
          setGaugeResultTone(lastGaugeCalculation.result_status || null);
          if (explainBtn) explainBtn.hidden = false;
        } catch (e) {
          result.innerHTML = '<b>Previous gauge result saved.</b><br>Run “Check my gauge” to refresh it for the current values.';
        }
      }

      setGaugeMode('');
      const defaultSimpleGaugeTab = qs(root, '[data-ss-gauge-tab="simple"]');
      const defaultAdvancedGaugeTab = qs(root, '[data-ss-gauge-tab="advanced"]');
      if (defaultSimpleGaugeTab) { defaultSimpleGaugeTab.classList.add('is-active'); defaultSimpleGaugeTab.setAttribute('aria-pressed', 'true'); }
      if (defaultAdvancedGaugeTab) { defaultAdvancedGaugeTab.classList.remove('is-active'); defaultAdvancedGaugeTab.setAttribute('aria-pressed', 'false'); }
      const defaultAdv = qs(root, '.ss-gauge-advanced-v735');
      if (defaultAdv) defaultAdv.open = false;
      const defaultCalc = qs(root, '[data-ss-gauge-calculator]');
      if (defaultCalc) defaultCalc.classList.remove('ss-gauge-advanced-active');
      qsa(root, '[data-ss-gauge-tab]').forEach(function(btn){
        btn.addEventListener('click', function(){
          const mode = btn.getAttribute('data-ss-gauge-tab') || 'simple';
          qsa(root, '[data-ss-gauge-tab]').forEach(function(other){
            const active = other === btn;
            other.classList.toggle('is-active', active);
            other.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          const adv = qs(root, '.ss-gauge-advanced-v735');
          if (adv) adv.open = mode === 'advanced';
          const calc = qs(root, '[data-ss-gauge-calculator]');
          if (calc) calc.classList.toggle('ss-gauge-advanced-active', mode === 'advanced');
        });
      });
      if (unit && custom) unit.addEventListener('change', function(){ custom.hidden = unit.value !== 'custom'; });
      if (calcBtn) calcBtn.addEventListener('click', calculateGauge);
      if (resetBtn) resetBtn.addEventListener('click', function(){
        setGaugeValue('[data-ss-target-stitches]', ''); setGaugeValue('[data-ss-target-rows]', '');
        setGaugeValue('[data-ss-actual-stitches]', ''); setGaugeValue('[data-ss-actual-rows]', '');
        setGaugeValue('[data-ss-pattern-stitch-count]', ''); setGaugeValue('[data-ss-pattern-row-count]', '');
        setGaugeValue('[data-ss-pattern-width-cm]', ''); setGaugeValue('[data-ss-pattern-height-cm]', '');
        setGaugeValue('[data-ss-actual-width-cm]', ''); setGaugeValue('[data-ss-actual-height-cm]', '');
        setGaugeValue('[data-ss-current-tool-size]', ''); setGaugeValue('[data-ss-pattern-tool-size]', ''); setGaugeValue('[data-ss-yarn-weight]', ''); const projectTypeEl = qs(root, '[data-ss-project-type]'); if (projectTypeEl) projectTypeEl.value = 'unknown'; setGaugeMode('');
        setGaugeResultTone(null);
        if (result) result.innerHTML = 'Start with the target stitches and your swatch stitches. I’ll do the maths without the migraine.';
        if (explainBtn) explainBtn.hidden = true;
      });
      if (usePatternBtn) usePatternBtn.addEventListener('click', async function(){
        if (!uploadedProject || !uploadedProject.project_id) {
          setGaugeResultTone(null);
          if (result) result.innerHTML = 'Upload a pattern first, then I can pull its gauge into this calculator.';
          return;
        }
        let parsed = parseGaugeFromText(getUploadedPatternGaugeText());
        if (!parsed || (!parsed.stitches && !(parsed.width_cm && parsed.height_cm))) {
          setGaugeResultTone(null);
          if (result) result.innerHTML = 'Looking through the uploaded pattern data for gauge/tension…';
          try { parsed = await fetchGaugeFromUploadedPattern(); } catch (error) { console.warn('StitchSense gauge lookup failed:', error); }
        }
        if (!parsed || (!parsed.stitches && !(parsed.width_cm && parsed.height_cm))) {
          setGaugeResultTone(null);
          setGaugeMode('');
          if (result) result.innerHTML = 'I could not extract a usable gauge from the uploaded pattern data automatically. You can still enter the target stitch/row values manually or use the block/motif size fields.';
          return;
        }
        const autoInfo = extractNeedleHookAndYarn(getUploadedPatternGaugeText(parsed.raw || ''));
        if (autoInfo.pattern_tool_size) setGaugeValue('[data-ss-pattern-tool-size]', autoInfo.pattern_tool_size);
        if (autoInfo.yarn_weight) setGaugeValue('[data-ss-yarn-weight]', autoInfo.yarn_weight);
        const craftEl = qs(root, '[data-ss-gauge-craft]');
        if (craftEl && autoInfo.craft_type && craftEl.value === 'unsure') craftEl.value = autoInfo.craft_type;
        const projectTypeEl = qs(root, '[data-ss-project-type]');
        if (projectTypeEl && projectTypeEl.value === 'unknown') projectTypeEl.value = inferGaugeProjectType();
        if (parsed.stitches) {
          setGaugeValue('[data-ss-target-stitches]', parsed.stitches);
          if (parsed.rows) setGaugeValue('[data-ss-target-rows]', parsed.rows);
          const unitEl = qs(root, '[data-ss-gauge-unit]');
          if (unitEl) unitEl.value = parsed.unit || '10cm';
          if (custom) custom.hidden = (parsed.unit || '10cm') !== 'custom';
          setGaugeMode('stitch_row', parsed);
          setGaugeResultTone(null);
          if (result) result.innerHTML = '<b>Pattern stitch gauge added.</b><br>Now add your swatch stitches' + (parsed.rows ? ' and rows' : '') + ', then hit “Check my gauge”.';
          return;
        }
        setGaugeValue('[data-ss-pattern-width-cm]', parsed.width_cm);
        setGaugeValue('[data-ss-pattern-height-cm]', parsed.height_cm);
        const adv = qs(root, '.ss-gauge-advanced-v735');
        if (adv) adv.open = true;
        setGaugeMode('dimension', parsed);
        setGaugeResultTone(null);
        if (result) result.innerHTML = '<b>Pattern block size added.</b><br>This pattern gives gauge as a finished block/motif measurement, not stitches and rows. I’ve added ' + roundGauge(parsed.width_cm, 1) + ' × ' + roundGauge(parsed.height_cm, 1) + ' cm in the optional size check. Measure your finished block, add your width and height, then hit “Check my gauge”.';
      });
      if (explainBtn) explainBtn.addEventListener('click', function(){
        const calc = lastGaugeCalculation || calculateGauge();
        if (!calc || !question) return;
        const chatTab = qs(root, '[data-ss-tab="chat"]');
        if (chatTab) chatTab.click();
        question.value = 'Explain this gauge calculation in plain English and tell me what to do next. Keep the uploaded pattern attached for any follow-up questions about adjusting or reworking the pattern. Result JSON: ' + JSON.stringify(calc);
        // Send immediately so the user does not have to notice and press Go! manually.
        // Keep this routed through the normal ask() path so history, uploaded pattern context,
        // loading states and local gauge memory all stay consistent.
        ask();
      });
    }

    initGaugeCalculator();

    qsa(root, '[data-ss-gauge-list]').forEach(function(gauge) {
      gauge.innerHTML = gaugeItems.map(function (item) {
        return '<div class="ss-gauge-item"><b>' + escapeHtml(item[0]) + '</b><span>' + escapeHtml(item[1]) + ' · ' + escapeHtml(item[2]) + '</span></div>';
      }).join('');
    });

    const conversions = qs(root, '[data-ss-crochet-conversions]');
    if (conversions) {
      conversions.innerHTML = crochetConversions.map(function (item) {
        return '<div class="ss-conversion-row"><b>' + escapeHtml(item[0]) + '</b><span>' + escapeHtml(item[1]) + '</span><em>' + escapeHtml(item[2]) + '</em></div>';
      }).join('');
    }

    const calc = qs(root, '[data-ss-calc-tension]');
    if (calc) {
      calc.addEventListener('click', function () {
        const s = parseFloat(qs(root, '[data-ss-stitches]').value || '0');
        const r = parseFloat(qs(root, '[data-ss-rows]').value || '0');
        const w = parseFloat(qs(root, '[data-ss-width]').value || '0');
        const h = parseFloat(qs(root, '[data-ss-height]').value || '0');
        const result = qs(root, '[data-ss-tension-result]');
        if (!s || !r || !w || !h) {
          result.innerHTML = 'Enter all four values to calculate.';
          return;
        }
        result.innerHTML = '<b>Estimated size:</b><br>' + Math.round((s / 10) * w) + ' stitches across and ' + Math.round((r / 10) * h) + ' rows high.';
      });
    }

    const yarnCalc = qs(root, '[data-ss-calc-yarn]');
    if (yarnCalc) {
      yarnCalc.addEventListener('click', function () {
        const metres = parseFloat(qs(root, '[data-ss-yarn-metres]').value || '0');
        const oldW = parseFloat(qs(root, '[data-ss-yarn-old-width]').value || '0');
        const newW = parseFloat(qs(root, '[data-ss-yarn-new-width]').value || '0');
        const result = qs(root, '[data-ss-yarn-result]');
        if (!metres || !oldW || !newW) {
          result.innerHTML = 'Enter all values to estimate yarn.';
          return;
        }
        const estimate = Math.ceil(metres * (newW / oldW) * 1.1);
        result.innerHTML = '<div class="ss-mini-result-card"><b>Allow around ' + estimate + ' metres</b><span>This includes a 10% safety buffer. Buy a little extra if your yarn is hand-dyed or batch-sensitive.</span></div>';
      });
    }

    const adjCalc = qs(root, '[data-ss-calc-adjustment]');
    if (adjCalc) {
      adjCalc.addEventListener('click', function () {
        const yours = parseFloat(qs(root, '[data-ss-your-sts]').value || '0');
        const pattern = parseFloat(qs(root, '[data-ss-pattern-sts]').value || '0');
        const result = qs(root, '[data-ss-adjustment-result]');
        if (!yours || !pattern) {
          result.innerHTML = 'Enter both stitch counts.';
          return;
        }
        if (Math.abs(yours - pattern) < 0.5) {
          result.innerHTML = '<div class="ss-mini-result-card is-good"><b>Good match</b><span>Your tension is close. Keep your current needle or hook size.</span></div>';
        } else if (yours < pattern) {
          result.innerHTML = '<div class="ss-mini-result-card is-warn"><b>Your stitches are too large</b><span>Try going down 0.5 mm and swatch again. This should make the fabric smaller and firmer.</span></div>';
        } else {
          result.innerHTML = '<div class="ss-mini-result-card is-warn"><b>Your stitches are too small</b><span>Try going up 0.5 mm and swatch again. This should make the fabric larger and looser.</span></div>';
        }
      });
    }

    const easeCalc = qs(root, '[data-ss-calc-ease]');
    if (easeCalc) {
      easeCalc.addEventListener('click', function () {
        const body = parseFloat(qs(root, '[data-ss-body-measure]').value || '0');
        const garment = parseFloat(qs(root, '[data-ss-garment-measure]').value || '0');
        const result = qs(root, '[data-ss-ease-result]');
        if (!body || !garment) {
          result.innerHTML = 'Enter both measurements.';
          return;
        }
        const ease = Math.round((garment - body) * 10) / 10;
        result.innerHTML = '<div class="ss-mini-result-card"><b>' + ease + ' cm ease</b><span>' + (ease < 0 ? 'Negative ease: this will fit closely or stretch on the body.' : ease < 5 ? 'Close fit: neat and fairly fitted.' : ease < 12 ? 'Relaxed fit: comfortable everyday room.' : 'Loose or oversized fit: intentionally roomy.') + '</span></div>';
      });
    }



    function updateProjectReadyMeter() {
      const checklist = qs(root, '[data-ss-ready-checklist]');
      if (!checklist) return;
      const boxes = qsa(checklist, 'input[type="checkbox"]');
      const checked = boxes.filter(function (box) { return box.checked; }).length;
      const total = boxes.length || 0;
      const percent = total ? Math.round((checked / total) * 100) : 0;
      const count = qs(root, '[data-ss-ready-count]');
      const status = qs(root, '[data-ss-ready-status]');
      const bar = qs(root, '[data-ss-ready-bar]');
      if (count) count.textContent = checked + ' / ' + total + ' complete';
      if (bar) bar.style.width = percent + '%';
      if (status) {
        status.textContent = percent >= 100 ? 'Ready to start' : percent >= 75 ? 'Almost ready' : 'Needs preparation';
      }
      try { localStorage.setItem(storagePrefix + 'quicktools_ready_checklist', JSON.stringify(boxes.map(function (box) { return !!box.checked; }))); } catch (e) {}
    }

    function initProjectReadyChecklist() {
      const checklist = qs(root, '[data-ss-ready-checklist]');
      if (!checklist) return;
      const boxes = qsa(checklist, 'input[type="checkbox"]');
      try {
        const saved = JSON.parse(localStorage.getItem(storagePrefix + 'quicktools_ready_checklist') || '[]');
        if (Array.isArray(saved)) boxes.forEach(function (box, index) { box.checked = !!saved[index]; });
      } catch (e) {}
      boxes.forEach(function (box) { box.addEventListener('change', updateProjectReadyMeter); });
      updateProjectReadyMeter();
    }

    initProjectReadyChecklist();
    renderQuickStarts();
    renderMessages();
    updatePatternViewerButton();
    restoreUploadedProjectPdf(uploadedProject, persistUploadedProject).then(function(restored) {
      if (restored) updatePatternViewerButton();
    });

    var stitchTooltip = null;
    var stitchTooltipTimeout = null;

    function ensureTooltip() {
      if (stitchTooltip) return;
      stitchTooltip = document.createElement('div');
      stitchTooltip.className = 'ss-stitch-tooltip';
      stitchTooltip.hidden = true;
      document.body.appendChild(stitchTooltip);
      stitchTooltip.addEventListener('mouseenter', function() {
        clearTimeout(stitchTooltipTimeout);
      });
      stitchTooltip.addEventListener('mouseleave', function() {
        hideTooltipAfter(150);
      });
      stitchTooltip.addEventListener('click', function(event) {
        var askBtn = event.target.closest('.ss-tooltip-ask');
        if (askBtn) {
          var prompt = askBtn.getAttribute('data-ss-stitch-ask') || '';
          var chatTab = qs(root, '[data-ss-tab="chat"]');
          if (chatTab) chatTab.click();
          if (question) {
            question.value = prompt;
            question.focus();
          }
          ask({ generalOnly: true });
          hideTooltipNow();
        }
      });
    }

    function showTooltip(stitchName, x, y) {
      var item = findStitchItem(stitchName);
      if (!item) return;
      ensureTooltip();
      stitchTooltip.innerHTML = buildStitchTooltipHtml(item);
      stitchTooltip.hidden = false;
      var rect = stitchTooltip.getBoundingClientRect();
      var viewportW = window.innerWidth;
      var viewportH = window.innerHeight;
      var left = x + 12;
      var top = y - 10;
      if (left + 320 > viewportW) left = x - 320 - 12;
      if (left < 8) left = 8;
      if (top + rect.height > viewportH) top = viewportH - rect.height - 16;
      if (top < 16) top = 16;
      stitchTooltip.style.left = left + 'px';
      stitchTooltip.style.top = top + 'px';
    }

    function hideTooltipNow() {
      clearTimeout(stitchTooltipTimeout);
      if (stitchTooltip) {
        stitchTooltip.hidden = true;
        stitchTooltip.innerHTML = '';
      }
    }

    function hideTooltipAfter(delay) {
      clearTimeout(stitchTooltipTimeout);
      stitchTooltipTimeout = setTimeout(hideTooltipNow, delay);
    }

	    function stitchRefBelongsToHub(ref) {
	      return !!(ref && (root.contains(ref) || ref.closest('[data-ss-library-detail-modal]')));
	    }

	    document.addEventListener('mouseover', function(event) {
	      var ref = event.target.closest('.ss-stitch-ref');
	      if (ref && !stitchRefBelongsToHub(ref)) return;
	      if (!ref) {
	        if (stitchTooltip && !stitchTooltip.hidden && !stitchTooltip.contains(event.target)) {
	          hideTooltipAfter(300);
	        }
	        return;
      }
      clearTimeout(stitchTooltipTimeout);
      var name = ref.getAttribute('data-ss-stitch') || '';
	      var rect = ref.getBoundingClientRect();
	      showTooltip(name, rect.left, rect.bottom);
	    });

	    document.addEventListener('mouseout', function(event) {
	      var ref = event.target.closest('.ss-stitch-ref');
	      if (ref && !stitchRefBelongsToHub(ref)) return;
	      if (!ref) return;
	      hideTooltipAfter(400);
	    });
if (hasLoadedPatternContext() && question && !question.value.trim()) {
      question.value = ssDefaultStepGuidePrompt;
      question.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /* ======================================================================
       v7.5.0 — AI Rework (Pattern Rewriting)
       ====================================================================== */

    function initRework() {
      var reworkQuestion = qs(root, '[data-ss-rework-question]');
      var reworkSend = qs(root, '[data-ss-rework-send]');
      var reworkMessages = qs(root, '[data-ss-rework-messages]');
      var reworkThinking = qs(root, '[data-ss-rework-thinking]');
      var reworkIntro = qs(root, '[data-ss-rework-intro]');
      var reworkResult = qs(root, '[data-ss-rework-result]');
      var reworkStatus = qs(root, '[data-ss-rework-status]');
      var reworkStatusText = qs(root, '[data-ss-rework-status-text]');
      var reworkReset = qs(root, '[data-ss-rework-reset]');

      var reworkHistory = [];
      var reworkSessionId = '';
      var reworkResultText = '';
      var reworkChanges = [];
      var reworkWarnings = [];
      var reworkConfidence = 0;
      var originalPatternText = '';

      function freshReworkSession() {
        return 'rework_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      }

      function loadReworkSession() {
        reworkSessionId = freshReworkSession();
        try {
          var saved = localStorage.getItem(storagePrefix + 'rework_history');
          if (saved) {
            reworkHistory = JSON.parse(saved);
          }
          var savedSession = localStorage.getItem(storagePrefix + 'rework_session_id');
          if (savedSession) reworkSessionId = savedSession;
          var savedResult = localStorage.getItem(storagePrefix + 'rework_result');
          if (savedResult) reworkResultText = savedResult;
          var savedChanges = localStorage.getItem(storagePrefix + 'rework_changes');
          if (savedChanges) reworkChanges = JSON.parse(savedChanges);
          var savedWarnings = localStorage.getItem(storagePrefix + 'rework_warnings');
          if (savedWarnings) reworkWarnings = JSON.parse(savedWarnings);
          var savedConfidence = localStorage.getItem(storagePrefix + 'rework_confidence');
          if (savedConfidence) reworkConfidence = parseInt(savedConfidence, 10) || 0;
          var savedOriginal = localStorage.getItem(storagePrefix + 'rework_original');
          if (savedOriginal) originalPatternText = savedOriginal;
        } catch(e) {}
      }

      function saveReworkSession() {
        try {
          localStorage.setItem(storagePrefix + 'rework_history', JSON.stringify(reworkHistory));
          localStorage.setItem(storagePrefix + 'rework_session_id', reworkSessionId);
          if (reworkResultText) localStorage.setItem(storagePrefix + 'rework_result', reworkResultText);
          if (reworkChanges.length) localStorage.setItem(storagePrefix + 'rework_changes', JSON.stringify(reworkChanges));
          if (reworkWarnings.length) localStorage.setItem(storagePrefix + 'rework_warnings', JSON.stringify(reworkWarnings));
          if (reworkConfidence) localStorage.setItem(storagePrefix + 'rework_confidence', String(reworkConfidence));
          if (originalPatternText) localStorage.setItem(storagePrefix + 'rework_original', originalPatternText);
        } catch(e) {}
      }

      function renderReworkMessages() {
        if (!reworkMessages) return;
        reworkMessages.innerHTML = reworkHistory.map(function (msg) {
          var role = msg.role || 'user';
          return '<div class="ss-msg ss-msg-' + role + '"><div class="ss-msg-content">' + escapeHtml(msg.content) + '</div></div>';
        }).join('');
        reworkMessages.scrollTop = reworkMessages.scrollHeight;
      }

      function setReworkLoading(loading) {
        if (reworkThinking) reworkThinking.hidden = !loading;
        if (reworkSend) reworkSend.disabled = loading;
        if (reworkQuestion) reworkQuestion.disabled = loading;
      }

      function updateReworkStatus(text) {
        if (reworkStatusText) reworkStatusText.textContent = text;
      }

      function showReworkResult() {
        if (reworkIntro) reworkIntro.hidden = true;
        if (reworkResult) reworkResult.hidden = false;

        var changesEl = root.querySelector('[data-ss-rework-changes]');
        if (changesEl) {
          changesEl.innerHTML = reworkChanges.map(function(c) {
            var isWarning = /warning|assum/i.test(c);
            return '<span class="ss-rework-change-tag' + (isWarning ? ' ss-rework-warning-tag' : '') + '">' + escapeHtml(c) + '</span>';
          }).join('');
        }

        var bodyEl = root.querySelector('[data-ss-rework-result-body]');
        if (bodyEl) bodyEl.innerHTML = formatAssistantText(reworkResultText || '');

        var titleEl = root.querySelector('[data-ss-rework-result-title]');
        if (titleEl) titleEl.textContent = 'Rewritten pattern' + (reworkConfidence ? ' (' + reworkConfidence + '% confidence)' : '');
      }

      function hideReworkResult() {
        if (reworkIntro) reworkIntro.hidden = false;
        if (reworkResult) reworkResult.hidden = true;

        var compareView = root.querySelector('[data-ss-rework-compare-view]');
        if (compareView) compareView.hidden = true;
      }

      function resetRework() {
        reworkHistory = [];
        reworkSessionId = freshReworkSession();
        reworkResultText = '';
        reworkChanges = [];
        reworkWarnings = [];
        reworkConfidence = 0;
        originalPatternText = '';
	        clearReworkStorage();
	        if (reworkMessages) reworkMessages.innerHTML = '';
	        if (reworkQuestion) reworkQuestion.value = '';
	        hideReworkResult();
	        updateReworkStatus('Ready to start. Describe your desired change above.');
	      }
	      resetReworkState = resetRework;

      async function doRework() {
        var text = (reworkQuestion && reworkQuestion.value || '').trim();
        if (!text) return;
        if (!hasLoadedPatternContext()) {
          updateReworkStatus('Please upload a pattern first via the Pattern Chat panel.');
          return;
        }

        reworkHistory.push({ role: 'user', content: text });
        saveReworkSession();
        renderReworkMessages();
        if (reworkQuestion) reworkQuestion.value = '';
        setReworkLoading(true);
        updateReworkStatus('Analysing your pattern and calculating the rewrite...');

        try {
          var response = await ssPostChat(Object.assign({
            action: 'chat',
            question: text,
            tool_mode: 'pattern_rewrite',
            session_id: reworkSessionId,
            skill_level: skill ? skill.value : 'beginner',
            history: reworkHistory.slice(-10),
          }, activePatternContextPayload(true)));

          var data = await ssParseJsonResponse(response);
          if (!response.ok || data.success === false) {
            throw new Error(data.error || 'Rewrite failed');
          }

          var answer = data.answer || 'Sorry, I was unable to produce a rewrite this time.';
          reworkHistory.push({ role: 'assistant', content: answer });
          reworkResultText = answer;

          if (data.structured_data) {
            var sd = data.structured_data;
            if (sd.changes_made && Array.isArray(sd.changes_made)) reworkChanges = sd.changes_made;
            else if (sd.rewrite_summary) reworkChanges = [String(sd.rewrite_summary)];
            if (sd.warnings && Array.isArray(sd.warnings)) reworkWarnings = sd.warnings;
            if (sd.confidence_score) reworkConfidence = parseInt(sd.confidence_score, 10) || 0;
            if (sd.original_pattern_title && !originalPatternText) {
              originalPatternText = data._original_pattern || answer;
            }
          }

          updateReworkStatus('Rewrite complete. You can refine, copy, download, or compare.');
          showReworkResult();
          await saveRewriteToLibrary(text, answer, reworkChanges, reworkWarnings, reworkConfidence);
        } catch (err) {
          var detail = err && err.message ? String(err.message) : 'Unknown error.';
          reworkHistory.push({ role: 'assistant', content: 'Sorry, the rewrite could not be completed. Technical detail: ' + detail });
          updateReworkStatus('Rewrite failed. Please try again.');
          console.error('Rework error:', err);
        } finally {
          saveReworkSession();
          renderReworkMessages();
          setReworkLoading(false);
          if (reworkQuestion) reworkQuestion.focus();
        }
      }

      function copyReworkResult() {
        if (!reworkResultText) return;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(assistantPlainText(reworkResultText));
          updateReworkStatus('Copied to clipboard.');
        }
      }

      function downloadReworkResult() {
        if (!reworkResultText) return;
        var title = uploadedProject && uploadedProject.detected_title ? uploadedProject.detected_title : 'rewritten-pattern';
        var cleanTitle = String(title).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_') || 'rewritten-pattern';
        var blob = new Blob([reworkResultText], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = cleanTitle + '_rewritten.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateReworkStatus('Downloaded as ' + cleanTitle + '_rewritten.txt');
      }

      function refineRework() {
        if (reworkQuestion) {
          reworkQuestion.value = '';
          reworkQuestion.placeholder = 'Describe what to change, e.g. "Make the sleeves 3 cm longer"';
          reworkQuestion.focus();
        }
        updateReworkStatus('Describe your refinement above and click Rewrite.');
      }

      function toggleCompare() {
        var compareView = root.querySelector('[data-ss-rework-compare-view]');
        if (!compareView) return;
        var isHidden = compareView.hidden;
        compareView.hidden = !isHidden;

        if (!isHidden) return;

        var originalEl = root.querySelector('[data-ss-rework-compare-original]');
        var rewrittenEl = root.querySelector('[data-ss-rework-compare-rewritten]');

        if (originalEl) {
          originalEl.innerHTML = formatAssistantText(originalPatternText || (reworkHistory.length > 0 && reworkHistory[0].content) || 'Original pattern text not available. Upload a pattern first.');
        }
        if (rewrittenEl) {
          rewrittenEl.innerHTML = formatAssistantText(reworkResultText || 'No rewrite generated yet.');
        }
      }

      function useReworkPrompt(promptText) {
        if (reworkQuestion) {
          reworkQuestion.value = promptText;
          reworkQuestion.dispatchEvent(new Event('input', { bubbles: true }));
          reworkQuestion.focus();
        }
      }

      if (reworkSend) reworkSend.addEventListener('click', doRework);
      if (reworkQuestion) {
        reworkQuestion.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doRework();
          }
        });
      }
      if (reworkReset) reworkReset.addEventListener('click', resetRework);

      root.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-ss-rework-prompt]');
        if (!btn || !root.contains(btn)) return;
        event.preventDefault();
        useReworkPrompt(btn.getAttribute('data-ss-rework-prompt') || btn.textContent || '');
      });

      var copyBtn = root.querySelector('[data-ss-rework-copy]');
      var downloadBtn = root.querySelector('[data-ss-rework-download]');
      var refineBtn = root.querySelector('[data-ss-rework-refine]');
      var compareBtn = root.querySelector('[data-ss-rework-compare]');
      var compareCloseBtn = root.querySelector('[data-ss-rework-compare-close]');

      if (copyBtn) copyBtn.addEventListener('click', function(e){ e.preventDefault(); copyReworkResult(); });
      if (downloadBtn) downloadBtn.addEventListener('click', function(e){ e.preventDefault(); downloadReworkResult(); });
      if (refineBtn) refineBtn.addEventListener('click', function(e){ e.preventDefault(); refineRework(); });
      if (compareBtn) compareBtn.addEventListener('click', function(e){ e.preventDefault(); toggleCompare(); });
      if (compareCloseBtn) compareCloseBtn.addEventListener('click', function(e){ e.preventDefault(); var v = root.querySelector('[data-ss-rework-compare-view]'); if(v) v.hidden = true; });

            loadReworkSession();
      if (reworkResultText) showReworkResult();
      renderReworkMessages();

      if (hasLoadedPatternContext()) {
        syncReworkUploadedState();
      } else {
        setTimeout(function () {
          var currentPanel = localStorage.getItem(storagePrefix + 'active_panel');
          if (currentPanel === 'rework' && !hasLoadedPatternContext()) {
            uploadOrigin = 'rework';
            var reworkUploadBtn = qs(root, '.ss-rework-upload-trigger');
            if (reworkUploadBtn) reworkUploadBtn.click();
          }
        }, 400);
      }
    }

    /* ======================================================================
       Projects
       ====================================================================== */

    function initProjects() {
      var page = qs(root, '.ss-projects-page');
      if (!page) return;

      var grid = qs(page, '[data-ss-projects-grid]');
      var empty = qs(page, '[data-ss-projects-empty]');
      var loading = qs(page, '[data-ss-projects-loading]');
      var error = qs(page, '[data-ss-projects-error]');
      var auth = qs(page, '[data-ss-projects-auth]');
      var search = qs(page, '[data-ss-projects-search]');
      var statusFilter = qs(page, '[data-ss-projects-status]');
      var form = qs(page, '[data-ss-projects-form]');
      var formStatus = qs(page, '[data-ss-projects-form-status]');
      var patternSelect = qs(page, '[data-ss-project-pattern]');
      var projectTitle = qs(page, '[data-ss-project-title]');
      var projectStatus = qs(page, '[data-ss-project-status]');
      var projectProgress = qs(page, '[data-ss-project-progress]');
      var projectStage = qs(page, '[data-ss-project-stage]');
      var projectRecipient = qs(page, '[data-ss-project-recipient]');
      var projectNotes = qs(page, '[data-ss-project-notes]');
      var projectsCache = [];
      var patternsCache = [];
      var searchTimer = null;

      function showProjectsState(state) {
        if (grid) grid.hidden = state !== 'results';
        if (empty) empty.hidden = state !== 'empty';
        if (loading) loading.hidden = state !== 'loading';
        if (error) error.hidden = state !== 'error';
        if (auth) auth.hidden = state !== 'auth';
      }

      function setProjectFormStatus(text) {
        if (formStatus) formStatus.textContent = text || '';
      }

      function projectDate(value) {
        if (!value) return '';
        try {
          return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
        } catch (err) {
          return '';
        }
      }

      function normaliseProgress(value) {
        var number = parseInt(value || '0', 10);
        if (!Number.isFinite(number)) number = 0;
        return Math.max(0, Math.min(100, number));
      }

      function statusLabel(value) {
        var labels = {
          planned: 'Planned',
          active: 'Active',
          paused: 'Paused',
          completed: 'Completed',
          archived: 'Archived'
        };
        return labels[value] || 'Active';
      }

      function linkedPatternTitle(project) {
        return project.linked_pattern_title || project.patternTitle || project.pattern_title || '';
      }

      function renderProjectCard(project) {
        var id = project.id || '';
        var title = project.title || linkedPatternTitle(project) || 'Untitled project';
        var progress = normaliseProgress(project.progress_percent);
        var status = project.status || 'active';
        var stage = project.stage_label || 'Getting started';
        var meta = [];
        if (linkedPatternTitle(project)) meta.push(linkedPatternTitle(project));
        if (project.recipient) meta.push('For ' + project.recipient);
        if (project.updated_at) meta.push('Updated ' + projectDate(project.updated_at));

        return '<article class="ss-project-card" data-ss-project-card="' + escapeHtml(id) + '">' +
          '<header class="ss-project-card-head">' +
            '<div><span class="ss-library-badge ss-project-status-badge">' + escapeHtml(statusLabel(status)) + '</span><h4>' + escapeHtml(title) + '</h4><p>' + escapeHtml(meta.join(' · ')) + '</p></div>' +
            '<button type="button" class="ss-secondary ss-danger" data-ss-project-delete="' + escapeHtml(id) + '">Delete</button>' +
          '</header>' +
          '<div class="ss-project-progress-row"><span>' + escapeHtml(stage) + '</span><strong>' + progress + '%</strong></div>' +
          '<div class="ss-project-progress-track"><i style="width:' + progress + '%"></i></div>' +
          '<div class="ss-project-card-fields">' +
            '<label>Status<select data-ss-project-inline-status><option value="planned">Planned</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>' +
            '<label>Progress<input type="number" min="0" max="100" step="1" data-ss-project-inline-progress value="' + progress + '"></label>' +
            '<label>Stage<input type="text" maxlength="120" data-ss-project-inline-stage value="' + escapeHtml(stage) + '"></label>' +
          '</div>' +
          '<label class="ss-project-notes-inline">Notes<textarea rows="3" data-ss-project-inline-notes>' + escapeHtml(project.notes || '') + '</textarea></label>' +
          '<footer class="ss-project-card-actions">' +
            '<button type="button" class="ss-standard-btn ss-go-btn" data-ss-project-save="' + escapeHtml(id) + '">Save</button>' +
            '<button type="button" class="ss-secondary" data-ss-project-validate="' + escapeHtml(id) + '">Validate Sync</button>' +
            '<span data-ss-project-card-status></span>' +
          '</footer>' +
        '</article>';
      }

      function syncProjectCardFields() {
        qsa(page, '[data-ss-project-card]').forEach(function(card) {
          var id = card.getAttribute('data-ss-project-card');
          var project = projectsCache.find(function(item) { return item && item.id === id; }) || {};
          var statusInput = qs(card, '[data-ss-project-inline-status]');
          if (statusInput) statusInput.value = project.status || 'active';
        });
      }

      function renderProjects() {
        if (!grid) return;
        if (!projectsCache.length) {
          grid.innerHTML = '';
          showProjectsState('empty');
          return;
        }
        grid.innerHTML = projectsCache.map(renderProjectCard).join('');
        syncProjectCardFields();
        showProjectsState('results');
      }

      async function loadPatternsForProjectForm() {
        if (!patternSelect || patternsCache.length) return;
        var data = await libraryRequest('library/patterns?page=1&per_page=100');
        patternsCache = Array.isArray(data.patterns) ? data.patterns : [];
        patternSelect.innerHTML = '<option value="">Choose a pattern...</option>' + patternsCache.map(function(pattern) {
          return '<option value="' + escapeHtml(pattern.id) + '">' + escapeHtml(pattern.title || pattern.original_filename || 'Untitled pattern') + '</option>';
        }).join('');
      }

      async function loadProjects() {
        if (!isUserLoggedIn) {
          showProjectsState('auth');
          return;
        }
        showProjectsState('loading');
        var params = new URLSearchParams();
        if (search && search.value.trim()) params.set('search', search.value.trim());
        if (statusFilter && statusFilter.value) params.set('status', statusFilter.value);
        try {
          var data = await libraryRequest('projects' + (params.toString() ? '?' + params.toString() : ''));
          projectsCache = Array.isArray(data.projects) ? data.projects : [];
          renderProjects();
          loadPatternsForProjectForm().catch(function(err) {
            if (window.ssDebug === true) console.warn('StitchSense project pattern load failed:', err);
          });
        } catch (err) {
          if (error) {
            var message = error.querySelector('p');
            if (message) message.textContent = 'Could not load your projects: ' + (err && err.message ? err.message : 'Please try again.');
          }
          showProjectsState('error');
        }
      }

      function openProjectForm() {
        if (!form) return;
        form.hidden = false;
        setProjectFormStatus('');
        loadPatternsForProjectForm().catch(function(err) {
          setProjectFormStatus(err && err.message ? err.message : 'Saved patterns could not be loaded.');
        });
        if (projectTitle) projectTitle.value = '';
        if (projectStatus) projectStatus.value = 'planned';
        if (projectProgress) projectProgress.value = '0';
        if (projectStage) projectStage.value = '';
        if (projectRecipient) projectRecipient.value = '';
        if (projectNotes) projectNotes.value = '';
      }

      async function createProject(event) {
        event.preventDefault();
        if (!patternSelect || !patternSelect.value) {
          setProjectFormStatus('Choose a saved pattern first.');
          return;
        }
        setProjectFormStatus('Saving project...');
        try {
          await libraryRequest('projects', {
            method: 'POST',
            body: JSON.stringify({
              patternId: patternSelect.value,
              title: projectTitle && projectTitle.value.trim() ? projectTitle.value.trim() : undefined,
              status: projectStatus ? projectStatus.value : 'planned',
              stageLabel: projectStage && projectStage.value.trim() ? projectStage.value.trim() : undefined,
              progressMode: 'percent',
              progressPercent: projectProgress ? normaliseProgress(projectProgress.value) : 0,
              recipient: projectRecipient && projectRecipient.value.trim() ? projectRecipient.value.trim() : null,
              notes: projectNotes && projectNotes.value.trim() ? projectNotes.value.trim() : null
            })
          });
          if (form) form.hidden = true;
          setProjectFormStatus('');
          await loadProjects();
        } catch (err) {
          setProjectFormStatus(err && err.message ? err.message : 'Project could not be saved.');
        }
      }

      async function saveProjectFromCard(card, projectId) {
        var cardStatus = qs(card, '[data-ss-project-card-status]');
        var statusInput = qs(card, '[data-ss-project-inline-status]');
        var progressInput = qs(card, '[data-ss-project-inline-progress]');
        var stageInput = qs(card, '[data-ss-project-inline-stage]');
        var notesInput = qs(card, '[data-ss-project-inline-notes]');
        if (cardStatus) cardStatus.textContent = 'Saving...';
        try {
          await libraryRequest('projects/' + encodeURIComponent(projectId), {
            method: 'PUT',
            body: JSON.stringify({
              status: statusInput ? statusInput.value : undefined,
              progressMode: 'percent',
              progressPercent: progressInput ? normaliseProgress(progressInput.value) : undefined,
              stageLabel: stageInput && stageInput.value.trim() ? stageInput.value.trim() : 'Getting started',
              notes: notesInput ? notesInput.value.trim() : null
            })
          });
          if (cardStatus) cardStatus.textContent = 'Saved.';
          await loadProjects();
        } catch (err) {
          if (cardStatus) cardStatus.textContent = err && err.message ? err.message : 'Save failed.';
        }
      }

      async function validateProject(card, projectId) {
        var cardStatus = qs(card, '[data-ss-project-card-status]');
        if (cardStatus) cardStatus.textContent = 'Checking sync...';
        try {
          var data = await libraryRequest('projects/' + encodeURIComponent(projectId) + '/sync-validation');
          var checks = data.checks || {};
          var passed = checks.createVisibleInPlatform && checks.updateTimestampPresent && checks.linkedPatternIntegrity;
          if (cardStatus) cardStatus.textContent = passed ? 'Sync validated.' : 'Sync needs attention.';
        } catch (err) {
          if (cardStatus) cardStatus.textContent = err && err.message ? err.message : 'Validation failed.';
        }
      }

      async function deleteProject(projectId) {
        if (!window.confirm('Delete this project from your shared project list?')) return;
        try {
          await libraryRequest('projects/' + encodeURIComponent(projectId), { method: 'DELETE' });
          await loadProjects();
        } catch (err) {
          alert(err && err.message ? err.message : 'Project could not be deleted.');
        }
      }

      qsa(page, '[data-ss-projects-new]').forEach(function(btn) {
        btn.addEventListener('click', function(event) {
          event.preventDefault();
          openProjectForm();
        });
      });
      qsa(page, '[data-ss-projects-refresh], [data-ss-projects-retry]').forEach(function(btn) {
        btn.addEventListener('click', function(event) {
          event.preventDefault();
          loadProjects();
        });
      });
      var cancel = qs(page, '[data-ss-projects-cancel]');
      if (cancel) cancel.addEventListener('click', function(event) {
        event.preventDefault();
        if (form) form.hidden = true;
      });
      if (form) form.addEventListener('submit', createProject);
      if (search) search.addEventListener('input', function() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadProjects, 300);
      });
      if (statusFilter) statusFilter.addEventListener('change', loadProjects);
      if (grid) grid.addEventListener('click', function(event) {
        var saveBtn = event.target.closest('[data-ss-project-save]');
        var validateBtn = event.target.closest('[data-ss-project-validate]');
        var deleteBtn = event.target.closest('[data-ss-project-delete]');
        if (saveBtn) {
          event.preventDefault();
          saveProjectFromCard(saveBtn.closest('[data-ss-project-card]'), saveBtn.getAttribute('data-ss-project-save'));
        } else if (validateBtn) {
          event.preventDefault();
          validateProject(validateBtn.closest('[data-ss-project-card]'), validateBtn.getAttribute('data-ss-project-validate'));
        } else if (deleteBtn) {
          event.preventDefault();
          deleteProject(deleteBtn.getAttribute('data-ss-project-delete'));
        }
      });

      loadProjects();
    }

    /* ======================================================================
       v7.6.0 — Pattern Library
       ====================================================================== */

    function initLibrary() {
      if (!isUserLoggedIn) {
        var libAuth = qs(root, '[data-ss-library-auth]');
        var libEmpty = qs(root, '[data-ss-library-empty]');
        var libGrid  = qs(root, '[data-ss-library-grid]');
        var libLoad  = qs(root, '[data-ss-library-loading]');
        if (libAuth) libAuth.hidden = false;
        if (libEmpty) libEmpty.hidden = true;
        if (libGrid)  libGrid.innerHTML  = '';
        if (libLoad)  libLoad.hidden     = true;
        return;
      }

      var libGrid    = qs(root, '[data-ss-library-grid]');
      var libEmpty   = qs(root, '[data-ss-library-empty]');
      var libLoad    = qs(root, '[data-ss-library-loading]');
      var libError   = qs(root, '[data-ss-library-error]');
      var libAuth    = qs(root, '[data-ss-library-auth]');
      var libSearch  = qs(root, '[data-ss-library-search]');
      var libSort    = qs(root, '[data-ss-library-sort]');
      var libRetry   = qs(root, '[data-ss-library-retry]');

      var libraryCache = null;
      var activeCraft  = 'all';
      var searchTimer  = null;
      var activeLibraryDetailPatternId = '';

      function normaliseRavelryPatternUrl(value) {
        var url = String(value || '').trim();
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return url;
        if (/^(www\.)?ravelry\.com\//i.test(url)) return 'https://' + url.replace(/^\/+/, '');
        var marker = '/patterns/library/';
        var markerIndex = url.indexOf(marker);
        if (markerIndex !== -1) url = url.slice(markerIndex + marker.length);
        url = url.replace(/^\/+|\/+$/g, '');
        return url ? 'https://www.ravelry.com/patterns/library/' + encodeURIComponent(url) : '';
      }

      function showState(state) {
        if (libGrid)  libGrid.hidden  = state !== 'results';
        if (libEmpty) libEmpty.hidden = state !== 'empty';
        if (libLoad)  libLoad.hidden  = state !== 'loading';
        if (libError) libError.hidden = state !== 'error';
        if (libAuth)  libAuth.hidden  = true;
      }

      function getRavelryAvailability(pattern) {
        var metadata = pattern && pattern.metadata && typeof pattern.metadata === 'object' ? pattern.metadata : {};
        var source = pattern && pattern.source ? pattern.source : '';
	        if (source !== 'ravelry' && metadata.external_service !== 'ravelry') return '';
	        var value = String(metadata.ravelry_availability || metadata.availability || '').toLowerCase();
	        if (value === 'free' || value === 'free download' || metadata.ravelry_is_free === true) return 'free';
	        if (value === 'paid' || metadata.price || metadata.currency || metadata.pattern_price) return 'paid';
	        if (metadata.ravelry_url) return 'paid';
	        return 'paid';
      }

      function getRavelryAvailabilityBadge(pattern) {
        var availability = getRavelryAvailability(pattern);
        if (!availability) return '';
        if (availability === 'free') return '<span class="ss-library-badge ss-badge-free">Free</span>';
        if (availability === 'paid') return '<span class="ss-library-badge ss-badge-paid">Paid</span>';
        return '<span class="ss-library-badge ss-badge-unknown">Ravelry</span>';
      }

      function buildCardHtml(pattern) {
        var title = pattern.title || 'Untitled';
        var craft = pattern.craft_type || '';
        var source = pattern.source || 'upload';
        var metadata = pattern.metadata && typeof pattern.metadata === 'object' ? pattern.metadata : {};
        var extension = getLibraryPatternExtension(pattern);
        var chatCount = pattern.chat_count || 0;
        var rewriteCount = pattern.rewrite_count || 0;
        var dateStr = '';
        try {
          var d = new Date(pattern.created_at);
          dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
        } catch(e) {}

        var externalThumb = metadata.thumbnail_url || metadata.ravelry_thumbnail_url || '';
        var availabilityBadge = getRavelryAvailabilityBadge(pattern);
        var sourceBadge = source === 'rewrite' ? '<span class="ss-library-badge ss-badge-rewritten">Rewritten</span>' : (source === 'ravelry' ? '<span class="ss-library-badge ss-badge-ravelry">Ravelry</span>' : (source === 'import' ? '<span class="ss-library-badge ss-badge-imported">Imported</span>' : '<span class="ss-library-badge">Uploaded</span>'));

        var metaParts = [];
        if (chatCount > 0) metaParts.push('<span>💬 ' + chatCount + '</span>');
        if (rewriteCount > 0) metaParts.push('<span>🔄 ' + rewriteCount + '</span>');
        metaParts.push('<span class="ss-library-card-date">' + escapeHtml(dateStr) + '</span>');

        return '<article class="ss-library-card" data-ss-library-card="' + escapeHtml(pattern.id) + '">' +
          '<div class="ss-library-card-thumb" data-ss-library-thumb="' + escapeHtml(pattern.id) + '" data-ss-library-ext="' + escapeHtml(extension) + '">' +
            (externalThumb ? '<img src="' + escapeHtml(externalThumb) + '" alt="" loading="lazy">' : '<span>' + escapeHtml(extension === 'pdf' ? 'PDF' : (extension || 'Pattern').toUpperCase()) + '</span>') +
          '</div>' +
          '<div class="ss-library-card-top">' +
            '<h4 class="ss-library-card-title">' + escapeHtml(title) + '</h4>' +
            '<div class="ss-library-card-badges">' + sourceBadge + availabilityBadge + '</div>' +
          '</div>' +
          '<div class="ss-library-card-meta">' + metaParts.join('') + '</div>' +
        '</article>';
      }

      function renderCards(patterns) {
        if (!libGrid) return;
        if (!patterns || !patterns.length) {
          showState('empty');
          return;
        }
        showState('results');
        libGrid.innerHTML = patterns.map(buildCardHtml).join('');
        renderLibraryThumbnails(patterns);
      }

      function findThumbHost(patternId) {
        var hosts = qsa(libGrid, '[data-ss-library-thumb]');
        for (var i = 0; i < hosts.length; i++) {
          if (hosts[i].getAttribute('data-ss-library-thumb') === patternId) return hosts[i];
        }
        return null;
      }

      function findLibraryPatternById(patternId) {
        if (!patternId || !libraryCache || !Array.isArray(libraryCache.patterns)) return null;
        for (var i = 0; i < libraryCache.patterns.length; i++) {
          if (libraryCache.patterns[i] && libraryCache.patterns[i].id === patternId) return libraryCache.patterns[i];
        }
        return null;
      }

      function getPreviewSourcePattern(pattern) {
        var metadata = pattern && pattern.metadata && typeof pattern.metadata === 'object' ? pattern.metadata : {};
        var parent = findLibraryPatternById(pattern && pattern.parent_pattern_id);
        if (pattern && (pattern.file_url || pattern.project_id || metadata.file_extension || metadata.parent_file_url || metadata.parent_pdf_blob_key)) {
          if (metadata.parent_file_url || metadata.parent_pdf_blob_key) {
            return Object.assign({}, pattern, {
              file_url: metadata.parent_file_url || '',
              original_filename: metadata.parent_original_filename || pattern.original_filename || '',
              project_id: metadata.parent_project_id || pattern.project_id || '',
              file_extension: metadata.parent_file_extension || pattern.file_extension || '',
              metadata: Object.assign({}, metadata, {
                file_extension: metadata.parent_file_extension || metadata.file_extension || '',
                pdf_blob_key: metadata.parent_pdf_blob_key || ''
              })
            });
          }
          if (!pattern.file_url && parent) return parent;
          if (pattern.file_url || metadata.file_extension) return pattern;
        }
        return parent || pattern;
      }

      function getLibraryPatternExtension(pattern) {
        var previewPattern = getPreviewSourcePattern(pattern);
        var metadata = previewPattern && previewPattern.metadata && typeof previewPattern.metadata === 'object' ? previewPattern.metadata : {};
        return String((previewPattern && previewPattern.file_extension) || metadata.file_extension || getFileExtension((previewPattern && previewPattern.original_filename) || '')).toLowerCase();
      }

      function getLibraryPatternPdfBlob(pattern) {
        var previewPattern = getPreviewSourcePattern(pattern);
        var metadata = previewPattern && previewPattern.metadata && typeof previewPattern.metadata === 'object' ? previewPattern.metadata : {};
        var ext = getLibraryPatternExtension(previewPattern);
        var key = metadata.pdf_blob_key || (ext === 'pdf' && previewPattern && previewPattern.project_id ? ('project_' + previewPattern.project_id) : '');
        return key ? ssPdfDbGet(key) : Promise.resolve(null);
      }

      function renderPdfThumbnailToHost(pattern, host) {
        if (!host || host.dataset.ssThumbRendered === 'true') return;
        var previewPattern = getPreviewSourcePattern(pattern);
        var ext = getLibraryPatternExtension(previewPattern);
        if (ext !== 'pdf' || !window.pdfjsLib) return;
        host.dataset.ssThumbRendered = 'true';
        host.classList.add('is-loading');

        getLibraryPatternPdfBlob(previewPattern).then(function(blob) {
          if (blob) {
            return blob.arrayBuffer().then(function(buffer) {
              return window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
            });
          }
          if (!previewPattern.file_url) throw new Error('No PDF URL');
          return window.pdfjsLib.getDocument({ url: previewPattern.file_url, withCredentials: false }).promise;
        }).then(function(doc) {
          return doc.getPage(1);
        }).then(function(page) {
          var base = page.getViewport({ scale: 1 });
          var targetWidth = Math.max(120, host.clientWidth || 180);
          var scale = Math.min(0.55, Math.max(0.12, targetWidth / base.width));
          var viewport = page.getViewport({ scale: scale });
          var dpr = window.devicePixelRatio || 1;
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';
          return page.render({
            canvasContext: ctx,
            viewport: viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
          }).promise.then(function() {
            host.classList.remove('is-loading');
            host.classList.add('has-preview');
            host.innerHTML = '';
            host.appendChild(canvas);
          });
        }).catch(function(err) {
          host.classList.remove('is-loading');
          if (window.ssDebug === true) console.warn('StitchSense library thumbnail failed:', err);
        });
      }

      function renderLibraryThumbnails(patterns) {
        if (!patterns || !patterns.length || !window.pdfjsLib) return;
        patterns.slice(0, 60).forEach(function(pattern) {
          var host = findThumbHost(pattern.id);
          renderPdfThumbnailToHost(pattern, host);
        });
      }

      function patternToUploadedProject(p) {
        var metadata = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
        var patternExt = String(p.file_extension || metadata.file_extension || getFileExtension(p.original_filename || '')).toLowerCase();
        var structuredSummary = null;
        try {
          structuredSummary = typeof p.pattern_summary_structured === 'string' ? JSON.parse(p.pattern_summary_structured || '{}') : (p.pattern_summary_structured || null);
        } catch (err) {
          structuredSummary = null;
        }
        return {
          library_pattern_id: p.id,
          project_id: p.project_id,
          file_id: p.file_id,
          job_id: p.job_id,
          detected_title: p.title,
          craft_type: p.craft_type || '',
          detected_design_code: p.detected_design_code,
          pattern_summary_html: p.pattern_summary_html,
          pattern_summary_text: p.pattern_summary_text,
          pattern_summary_structured: structuredSummary,
          original_filename: p.original_filename,
          file_url: p.file_url,
          file_extension: patternExt,
          file_mime_type: metadata.file_mime_type || '',
          total_chunks: metadata.total_chunks || '',
          metadata: metadata,
          source: p.source || metadata.source || '',
          ravelry_id: p.ravelry_id || metadata.ravelry_id || '',
          ravelry_url: p.ravelry_url || metadata.ravelry_url || '',
          pdf_blob_key: patternExt === 'pdf' && p.project_id ? ('project_' + p.project_id) : '',
          pdf_blob_restored: false,
          local_pdf_url: ''
        };
      }

      async function hydrateChatFromSession(sessionIdToLoad, messageIdToFocus) {
        if (!sessionIdToLoad) return false;
        try {
          var data = await libraryRequest('library/chats/' + encodeURIComponent(sessionIdToLoad));
          var messagesFromServer = data.session && Array.isArray(data.session.messages) ? data.session.messages : [];
          if (messagesFromServer.length) {
            history = messagesFromServer.map(function(msg) {
              return {
                id: msg.id || msg.message_id || '',
                role: msg.role === 'user' ? 'user' : 'assistant',
                kind: msg.kind || 'message',
                content: msg.content || ''
              };
            });
            save();
            renderMessages();
            renderQuickStarts();
            if (messageIdToFocus) {
              setTimeout(function() { scrollToChatMessage(messageIdToFocus); }, 80);
            }
          }
          setActiveChatSessionId(sessionIdToLoad);
          return true;
        } catch (err) {
          console.warn('StitchSense library chat hydrate failed:', err);
          return false;
        }
      }

      async function loadPatternFromLibrary(pattern, targetPanel, sessionIdToLoad, messageIdToFocus, options) {
        if (!pattern) return;
        var opts = options || {};
        if (opts.fresh) {
          history = [];
          createFreshSession();
          setActiveChatSessionId('');
          localStorage.removeItem(storagePrefix + 'history');
          localStorage.removeItem(storagePrefix + 'library_chat_session_id');
          resetReworkState();
        }
        uploadedProject = patternToUploadedProject(pattern);
        setLibraryPatternId(pattern.id);
        setActiveChatSessionId(opts.fresh ? '' : (sessionIdToLoad || (pattern.chats && pattern.chats[0] && pattern.chats[0].id) || ''));
        currentPatternPdfBlob = null;
        persistUploadedProject();
        restoreUploadedProjectPdf(uploadedProject, persistUploadedProject).then(function(restored) {
          if (restored) updatePatternViewerButton();
        });
        syncSummaryPanel();
        syncReworkUploadedState();
        updatePatternViewerButton();
        renderQuickStarts();
        if (!opts.fresh && activeChatSessionId) await hydrateChatFromSession(activeChatSessionId, messageIdToFocus);
        setActivePanel(targetPanel || 'chat');
        if (messageIdToFocus) {
          setTimeout(function() { scrollToChatMessage(messageIdToFocus); }, 160);
        }
      }

      function ensureLibraryDetailModal() {
        var modal = qs(document, '[data-ss-library-detail-modal]');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'ss-library-detail-modal';
        modal.setAttribute('data-ss-library-detail-modal', '');
        modal.hidden = true;
        modal.innerHTML =
          '<div class="ss-library-detail-backdrop" data-ss-library-detail-close></div>' +
          '<section class="ss-library-detail-dialog" role="dialog" aria-modal="true" aria-label="Pattern library detail">' +
            '<button type="button" class="ss-library-detail-x" data-ss-library-detail-close aria-label="Close">×</button>' +
            '<div data-ss-library-detail-body></div>' +
          '</section>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(event) {
          if (event.target.closest('[data-ss-library-detail-close]')) {
            modal.hidden = true;
            activeLibraryDetailPatternId = '';
            document.body.classList.remove('ss-library-detail-open');
          }
        });
        return modal;
      }

      function listHtml(items, empty, kind) {
        if (!items || !items.length) return '<p class="ss-library-detail-muted">' + escapeHtml(empty) + '</p>';
        return items.map(function(item) {
          var date = item.updated_at || item.created_at || '';
          var title = kind === 'chat' && item.content ? item.content : (item.title || (kind === 'rewrite' ? 'Rewrite' : 'Chat session'));
          var extra = kind === 'rewrite' && item.confidence_score ? ' · ' + item.confidence_score + '% confidence' : '';
          var sessionId = item.session_id || item.id || '';
          var action = kind === 'chat' ? ' data-ss-library-open-chat="' + escapeHtml(sessionId) + '"' : '';
          var messageAction = kind === 'chat' && item.content && item.id ? ' data-ss-library-open-message="' + escapeHtml(String(item.id)) + '"' : '';
          var sub = kind === 'chat' && item.session_title ? item.session_title + (date ? ' · ' + date : '') : date;
          return '<button type="button" class="ss-library-history-row"' + action + messageAction + '><span>' + escapeHtml(title) + extra + '</span><small>' + escapeHtml(sub) + '</small></button>';
        }).join('');
      }

      async function refreshLibraryDetailHistory(patternId) {
        if (!patternId || activeLibraryDetailPatternId !== patternId) return;
        var modal = qs(document, '[data-ss-library-detail-modal]');
        if (!modal || modal.hidden) return;
        var body = qs(modal, '[data-ss-library-detail-body]');
        if (!body) return;
        var chatsPane = qs(body, '[data-ss-library-chat-history-pane]');
        var rewritesPane = qs(body, '[data-ss-library-rewrite-history-pane]');
        if (!chatsPane && !rewritesPane) return;
        try {
          var data = await libraryRequest('library/patterns/' + encodeURIComponent(patternId));
          var p = data.pattern || {};
          if (chatsPane) chatsPane.innerHTML = listHtml(p.chat_questions || p.chats, 'No saved chats yet.', 'chat');
          if (rewritesPane) rewritesPane.innerHTML = listHtml(p.rewrites, 'No rewrites yet.', 'rewrite');
        } catch (err) {
          console.warn('StitchSense library detail history refresh failed:', err);
        }
      }

      function normaliseProjectNotes(meta) {
        var source = meta && typeof meta === 'object' ? meta : {};
        var entries = Array.isArray(source.notes_entries) ? source.notes_entries.slice() : [];
        entries = entries.filter(function(note) {
          return note && String(note.text || '').trim();
        }).map(function(note, index) {
          return {
            id: String(note.id || ('note_' + index + '_' + Date.now())),
            text: String(note.text || '').trim(),
            created_at: note.created_at || note.timestamp || source.notes_updated_at || source.updated_at || '',
            author: note.author || currentUserName || 'You'
          };
        });
        if (!entries.length && source.notes && String(source.notes).trim()) {
          entries.push({
            id: 'legacy_note',
            text: String(source.notes).trim(),
            created_at: source.notes_updated_at || source.updated_at || '',
            author: currentUserName || 'You'
          });
        }
        entries.sort(function(a, b) {
          return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        });
        return entries;
      }

      function formatProjectNoteDate(value) {
        if (!value) return 'Saved note';
        try {
          var d = new Date(value);
          if (!isNaN(d.getTime())) {
            return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
          }
        } catch(e) {}
        return String(value);
      }

	      function renderProjectNotes(notes) {
	        if (!notes || !notes.length) {
	          return '<div class="ss-library-notes-empty">No project notes yet.</div>';
	        }
	        return '<div class="ss-library-notes-thread">' + notes.map(function(note) {
          return '<div class="ss-library-note-bubble" data-ss-library-note-id="' + escapeHtml(note.id) + '">' +
            '<div class="ss-library-note-meta"><span>' + escapeHtml(note.author || 'You') + '</span><time>' + escapeHtml(formatProjectNoteDate(note.created_at)) + '</time></div>' +
            '<p>' + escapeHtml(note.text).replace(/\n/g, '<br>') + '</p>' +
          '</div>';
	        }).join('') + '</div>';
	      }

	      function renderLibrarySummaryHtml(p) {
	        var html = p && p.pattern_summary_html ? String(p.pattern_summary_html) : '';
	        var text = p && p.pattern_summary_text ? String(p.pattern_summary_text) : '';
	        var rendered = html || formatAssistantText(text || 'No summary saved yet.');
	        var title = p && (p.title || p.detected_title || p.original_filename) ? String(p.title || p.detected_title || p.original_filename) : '';
	        var titleHtml = title ? '<div class="ss-library-summary-title">' + escapeHtml(title) + '</div>' : '';
	        return '<div class="ss-library-summary-chatlike ss-msg-assistant">' + titleHtml + injectStitchRefs(rendered) + '</div>';
	      }

	      function isWeakLibrarySummary(p) {
	        var text = stripAiMarkup((p && (p.pattern_summary_text || p.pattern_summary_html)) || '').toLowerCase();
	        if (!text) return true;
	        if (/pattern uploaded and (?:analysed|analyzed|ready)/i.test(text)) return true;
	        if (/ask me about sizing,\s*yarn substitution,\s*gauge/i.test(text)) return true;
	        if (/ravelry did not expose a pdf\/download url/i.test(text)) return true;
	        return text.length < 420 && !/(gauge|tension|yard|metre|meter|needle|hook|stitch|rib|increase|decrease|yarn).{0,120}(beginner|technique|construction|materials|size)/i.test(text);
	      }

	      function ensureSummaryTitle(structured, title) {
	        var summary = structured && typeof structured === 'object' && !Array.isArray(structured) ? Object.assign({}, structured) : {};
	        if (title && !summary.pattern_title) summary.pattern_title = title;
	        return summary;
	      }

	      async function refreshLibraryAiSummary(p, body, btn) {
	        if (!p) return;
	        var summaryWrap = qs(body, '[data-ss-library-summary-wrap]');
	        var originalLabel = btn ? btn.textContent : '';
	        if (btn) {
	          btn.disabled = true;
	          btn.textContent = 'Refreshing...';
	        }
	        if (summaryWrap) summaryWrap.innerHTML = '<div class="ss-library-detail-loading">Refreshing AI summary...</div>';
	        try {
	          var data = await libraryRequest('library/patterns/' + encodeURIComponent(p.id) + '/summary/refresh', {
	            method: 'POST',
	            body: JSON.stringify({ skillLevel: skill ? skill.value : 'beginner' })
	          });
	          var refreshedPattern = data.pattern || {};
	          p.pattern_summary_html = refreshedPattern.pattern_summary_html || p.pattern_summary_html || '';
	          p.pattern_summary_text = refreshedPattern.pattern_summary_text || p.pattern_summary_text || '';
	          p.pattern_summary_structured = refreshedPattern.pattern_summary_structured || p.pattern_summary_structured || null;
	          uploadedProject = patternToUploadedProject(Object.assign({}, p, refreshedPattern));
	          setLibraryPatternId(p.id || p.library_pattern_id || '');
	          persistUploadedProject();
	          syncSummaryPanel();
	          renderMessages();
	          renderQuickStarts();
	          if (summaryWrap) summaryWrap.innerHTML = renderLibrarySummaryHtml(p);
	          fetchLibrary({ page: 1, per_page: 50 });
	        } catch (err) {
	          if (summaryWrap) summaryWrap.innerHTML = renderLibrarySummaryHtml(p) + '<div class="ss-library-detail-warning">Could not refresh the AI summary: ' + escapeHtml(err && err.message ? err.message : 'Please try again.') + '</div>';
	        } finally {
	          if (btn) {
	            btn.disabled = false;
	            btn.textContent = originalLabel || 'Refresh AI Summary';
	          }
	        }
	      }

	      function showLibraryEditor(body, p) {
	        var summaryWrap = qs(body, '[data-ss-library-summary-wrap]');
        if (!summaryWrap) return;
        var currentHtml = p.pattern_summary_html || formatAssistantText(p.pattern_summary_text || '');
        summaryWrap.innerHTML =
          '<div class="ss-library-editor" data-ss-library-editor-wrap>' +
            '<div class="ss-library-editor-toolbar">' +
              '<button type="button" data-ss-editor-cmd="bold">B</button>' +
              '<button type="button" data-ss-editor-cmd="italic">I</button>' +
              '<button type="button" data-ss-editor-cmd="insertUnorderedList">List</button>' +
              '<button type="button" data-ss-editor-cmd="formatBlock" data-ss-editor-value="h4">Heading</button>' +
            '</div>' +
            '<div class="ss-library-editor-surface" data-ss-library-editor-content contenteditable="true">' + currentHtml + '</div>' +
            '<div class="ss-library-editor-actions">' +
              '<button type="button" class="ss-standard-btn ss-go-btn" data-ss-library-save-edit>Save Edit</button>' +
              '<button type="button" class="ss-secondary" data-ss-library-cancel-edit>Cancel</button>' +
              '<span data-ss-library-edit-status></span>' +
            '</div>' +
          '</div>';
        var editor = qs(summaryWrap, '[data-ss-library-editor-content]');
        if (editor) editor.focus();
      }

      function setLibraryDetailDebug(stage, patternId, err, data) {
        var detail = {
          stage: stage || 'unknown',
          pattern_id: patternId || '',
          message: err && err.message ? err.message : String(err || ''),
          data_keys: data && typeof data === 'object' ? Object.keys(data) : [],
          pattern_keys: data && data.pattern && typeof data.pattern === 'object' ? Object.keys(data.pattern) : [],
          at: new Date().toISOString()
        };
        window.ssLastLibraryDetailDebug = detail;
        console.error('StitchSense library detail debug:', detail, err || '');
        return detail;
      }

      function renderSimplePatternDetail(body, p, reason) {
        if (!body || !p) return false;
        var meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
	        var summary = renderLibrarySummaryHtml(p);
        var ravelryUrl = normaliseRavelryPatternUrl(meta.ravelry_url || meta.url || meta.source_url || '');
        body.innerHTML =
          '<header class="ss-library-detail-head">' +
            '<div><span class="ss-section-kicker">' + escapeHtml(p.source || 'Saved pattern') + '</span><h3>' + escapeHtml(p.title || 'Untitled') + '</h3><p>' + escapeHtml(p.original_filename || '') + '</p></div>' +
            '<div class="ss-library-detail-badges"><span class="ss-library-badge">' + escapeHtml(p.craft_type || 'Pattern') + '</span></div>' +
          '</header>' +
	          '<div class="ss-library-detail-actions">' +
	            '<button type="button" class="ss-standard-btn ss-go-btn" data-ss-library-open-chat-main>Open in Pattern Chat</button>' +
	            '<button type="button" class="ss-secondary" data-ss-library-open-rework>Open in AI Rework</button>' +
	            (ravelryUrl ? '<button type="button" class="ss-secondary" data-ss-library-open-ravelry>Buy/View on Ravelry</button>' : '') +
	          '</div>' +
          '<div class="ss-library-detail-warning">Loaded with the safe fallback. Debug detail: ' + escapeHtml(reason || 'full detail render failed') + '</div>' +
          '<div class="ss-library-detail-grid">' +
            '<article class="ss-library-detail-section"><h4>Summary</h4><div class="ss-library-detail-summary">' + summary + '</div></article>' +
          '</div>';
	        body.onclick = async function(event) {
	          var chatBtn = event.target.closest('[data-ss-library-open-chat-main]');
	          var reworkBtn = event.target.closest('[data-ss-library-open-rework]');
	          var openRavelryBtn = event.target.closest('[data-ss-library-open-ravelry]');
		          if (chatBtn || reworkBtn) {
		            event.preventDefault();
		            var modal = ensureLibraryDetailModal();
		            modal.hidden = true;
		            document.body.classList.remove('ss-library-detail-open');
		            await loadPatternFromLibrary(p, reworkBtn ? 'rework' : 'chat', null, null, { fresh: true });
		            return;
		          }
          if (openRavelryBtn) {
            event.preventDefault();
	            if (ravelryUrl) window.open(ravelryUrl, '_blank', 'noopener');
	          }
	        };
	        if (isWeakLibrarySummary(p) && (p.project_id || p.file_id || p.job_id || p.file_url || meta.stored_pdf_url)) {
	          setTimeout(function() { refreshLibraryAiSummary(p, body, null); }, 80);
	        }
	        return true;
	      }

      async function openPatternDetail(patternId, fallbackPattern) {
        var modal = ensureLibraryDetailModal();
        var body = qs(modal, '[data-ss-library-detail-body]');
        if (!body) return;
        activeLibraryDetailPatternId = patternId || '';
        body.innerHTML = '<div class="ss-library-detail-loading">Loading pattern…</div>';
        modal.hidden = false;
        document.body.classList.add('ss-library-detail-open');
        var detailData = null;
        var detailPattern = fallbackPattern || null;
        try {
          try {
            detailData = await libraryRequest('library/patterns/' + encodeURIComponent(patternId));
          } catch (requestErr) {
            setLibraryDetailDebug('request', patternId, requestErr, null);
            if (!fallbackPattern) throw requestErr;
            if (window.ssDebug === true) console.warn('StitchSense library detail request failed; using cached pattern:', requestErr);
            detailData = { pattern: fallbackPattern, fallback_reason: requestErr.message || 'request failed' };
          }
          var p = detailData.pattern || fallbackPattern;
          if (!p) throw new Error('Pattern detail was empty.');
          detailPattern = p;
          var meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
          var projectNotes = normaliseProjectNotes(meta);
	          var summary = renderLibrarySummaryHtml(p);
          var patternExt = String(p.file_extension || meta.file_extension || getFileExtension(p.original_filename || '')).toLowerCase();
          var previewForDetail = getPreviewSourcePattern(p);
          var previewMeta = previewForDetail && previewForDetail.metadata && typeof previewForDetail.metadata === 'object' ? previewForDetail.metadata : {};
          var previewExt = String((previewForDetail && previewForDetail.file_extension) || previewMeta.file_extension || getFileExtension((previewForDetail && previewForDetail.original_filename) || '')).toLowerCase();
	          var canViewPattern = !!(previewForDetail && previewForDetail.file_url && (previewExt === 'pdf' || patternExt === 'pdf'));
	          var ravelryUrl = normaliseRavelryPatternUrl(meta.ravelry_url || meta.url || meta.source_url || '');
	          var ravelryId = meta.ravelry_id || '';
	          var canOpenRavelry = !!(ravelryUrl && !canViewPattern);
          var canRefreshRavelry = p.source === 'ravelry' && ravelryId;
          var detailAvailabilityBadge = getRavelryAvailabilityBadge(p);
          body.innerHTML =
	            '<header class="ss-library-detail-head">' +
	              '<div><span class="ss-section-kicker">' + escapeHtml(p.source || 'Saved pattern') + '</span><h3>' + escapeHtml(p.title || 'Untitled') + '</h3><p>' + escapeHtml(p.original_filename || '') + '</p></div>' +
	              '<div class="ss-library-detail-badges"><span class="ss-library-badge">' + escapeHtml(p.craft_type || 'Pattern') + '</span>' + detailAvailabilityBadge + '</div>' +
	            '</header>' +
	            '<div class="ss-library-detail-actions">' +
	              '<button type="button" class="ss-standard-btn ss-go-btn" data-ss-library-open-chat-main>Open in Pattern Chat</button>' +
	              '<button type="button" class="ss-secondary" data-ss-library-open-rework>Open in AI Rework</button>' +
	              (canViewPattern ? '<button type="button" class="ss-secondary" data-ss-library-view-pattern>View Pattern</button>' : '') +
		              (canOpenRavelry ? '<button type="button" class="ss-secondary" data-ss-library-open-ravelry>Buy/View on Ravelry</button>' : '') +
		              (canRefreshRavelry ? '<button type="button" class="ss-secondary" data-ss-library-refresh-ravelry>Refresh from Ravelry</button>' : '') +
		              '<button type="button" class="ss-secondary" data-ss-library-refresh-summary>Refresh AI Summary</button>' +
		              '<button type="button" class="ss-secondary" data-ss-library-edit-pattern>Edit</button>' +
	              '<button type="button" class="ss-secondary" data-ss-library-download-summary>Download Summary</button>' +
              '<button type="button" class="ss-secondary" data-ss-library-archive>Archive</button>' +
              '<button type="button" class="ss-secondary ss-danger" data-ss-library-delete>Delete</button>' +
            '</div>' +
            '<div class="ss-library-detail-grid">' +
              '<article class="ss-library-detail-section"><h4>Summary</h4><div class="ss-library-detail-summary" data-ss-library-summary-wrap>' + summary + '</div></article>' +
              '<article class="ss-library-detail-section ss-library-history-section"><h4>Chat history</h4><div class="ss-library-history-pane" data-ss-library-chat-history-pane>' + listHtml(p.chat_questions || p.chats, 'No saved chats yet.', 'chat') + '</div></article>' +
              '<article class="ss-library-detail-section ss-library-history-section"><h4>Rewrite history</h4><div class="ss-library-history-pane" data-ss-library-rewrite-history-pane>' + listHtml(p.rewrites, 'No rewrites yet.', 'rewrite') + '</div></article>' +
              '<article class="ss-library-detail-section ss-library-project-notes"><h4>Project Notes</h4>' +
                '<label>Progress<select data-ss-library-progress><option value="">Not started</option><option value="planning">Planning</option><option value="in_progress">In progress</option><option value="paused">Paused</option><option value="finished">Finished</option></select></label>' +
                '<div data-ss-library-notes-list>' + renderProjectNotes(projectNotes) + '</div>' +
                '<textarea data-ss-library-note-new rows="4" placeholder="Add a new note, e.g. sizing notes, yarn substitutions, row reminders..."></textarea>' +
                '<div class="ss-library-notes-actions"><button type="button" class="ss-secondary" data-ss-library-save-notes>Add Note</button><button type="button" class="ss-secondary" data-ss-library-save-progress>Save Progress</button></div><p data-ss-library-notes-status></p>' +
              '</article>' +
            '</div>';
	          var progressField = qs(body, '[data-ss-library-progress]');
	          if (progressField && meta.progress_status) progressField.value = meta.progress_status;
	          if (isWeakLibrarySummary(p) && (p.project_id || p.file_id || p.job_id || p.file_url || meta.stored_pdf_url)) {
	            setTimeout(function() { refreshLibraryAiSummary(p, body, null); }, 80);
	          }

	          body.onclick = async function(event) {
            var chatBtn = event.target.closest('[data-ss-library-open-chat-main]');
            var viewPatternBtn = event.target.closest('[data-ss-library-view-pattern]');
            var openRavelryBtn = event.target.closest('[data-ss-library-open-ravelry]');
	            var refreshRavelryBtn = event.target.closest('[data-ss-library-refresh-ravelry]');
	            var refreshSummaryBtn = event.target.closest('[data-ss-library-refresh-summary]');
            var editBtn = event.target.closest('[data-ss-library-edit-pattern]');
            var saveEditBtn = event.target.closest('[data-ss-library-save-edit]');
            var cancelEditBtn = event.target.closest('[data-ss-library-cancel-edit]');
            var editorCmdBtn = event.target.closest('[data-ss-editor-cmd]');
            var reworkBtn = event.target.closest('[data-ss-library-open-rework]');
            var sessionBtn = event.target.closest('[data-ss-library-open-chat]');
            var messageIdToFocus = sessionBtn ? sessionBtn.getAttribute('data-ss-library-open-message') : '';
            var downloadBtn = event.target.closest('[data-ss-library-download-summary]');
            var archiveBtn = event.target.closest('[data-ss-library-archive]');
            var deleteBtn = event.target.closest('[data-ss-library-delete]');
            var notesBtn = event.target.closest('[data-ss-library-save-notes]');
            var progressBtn = event.target.closest('[data-ss-library-save-progress]');
            var promptBtn = event.target.closest('[data-ss-prompt]');
	            if (promptBtn) {
	              event.preventDefault();
	              modal.hidden = true;
	              document.body.classList.remove('ss-library-detail-open');
	              await loadPatternFromLibrary(p, 'chat', null, null, { fresh: true });
	              usePrompt(promptBtn.getAttribute('data-ss-prompt') || promptBtn.textContent || ssDefaultStepGuidePrompt);
	              return;
	            }
	            if (refreshSummaryBtn) {
	              event.preventDefault();
	              await refreshLibraryAiSummary(p, body, refreshSummaryBtn);
	              return;
	            }
            if (editorCmdBtn) {
              event.preventDefault();
              var command = editorCmdBtn.getAttribute('data-ss-editor-cmd') || '';
              var value = editorCmdBtn.getAttribute('data-ss-editor-value') || null;
              try { document.execCommand(command, false, value); } catch(e) {}
              var activeEditor = qs(body, '[data-ss-library-editor-content]');
              if (activeEditor) activeEditor.focus();
              return;
            }
            if (editBtn) {
              event.preventDefault();
              showLibraryEditor(body, p);
              return;
            }
            if (cancelEditBtn) {
              event.preventDefault();
              var summaryWrap = qs(body, '[data-ss-library-summary-wrap]');
	              if (summaryWrap) summaryWrap.innerHTML = renderLibrarySummaryHtml(p);
              return;
            }
            if (saveEditBtn) {
              event.preventDefault();
              var editorContent = qs(body, '[data-ss-library-editor-content]');
              var editStatus = qs(body, '[data-ss-library-edit-status]');
              var nextHtml = editorContent ? editorContent.innerHTML.trim() : '';
              var nextText = editorContent ? editorContent.textContent.trim() : '';
              if (!nextHtml) {
                if (editStatus) editStatus.textContent = 'Add some content before saving.';
                return;
              }
              if (editStatus) editStatus.textContent = 'Saving...';
              await libraryRequest('library/patterns/' + encodeURIComponent(p.id), {
                method: 'PUT',
                body: JSON.stringify({
                  pattern_summary_html: nextHtml,
                  pattern_summary_text: nextText
                })
              });
              p.pattern_summary_html = nextHtml;
              p.pattern_summary_text = nextText;
              var savedSummaryWrap = qs(body, '[data-ss-library-summary-wrap]');
	              if (savedSummaryWrap) savedSummaryWrap.innerHTML = renderLibrarySummaryHtml(p);
              if (uploadedProject && uploadedProject.library_pattern_id === p.id) {
                uploadedProject.pattern_summary_html = nextHtml;
                uploadedProject.pattern_summary_text = nextText;
                persistUploadedProject();
                syncSummaryPanel();
                renderMessages();
              }
              fetchLibrary({ page: 1, per_page: 50 });
              return;
            }
            if (viewPatternBtn) {
              event.preventDefault();
              var previewPattern = getPreviewSourcePattern(p);
              var viewerPattern = Object.assign({}, p, {
                file_url: (previewPattern && previewPattern.file_url) || p.file_url || '',
                file_extension: getLibraryPatternExtension(previewPattern || p) || p.file_extension || '',
                original_filename: (previewPattern && previewPattern.original_filename) || p.original_filename || '',
                project_id: (previewPattern && previewPattern.project_id) || p.project_id || ''
              });
              await loadPatternFromLibrary(viewerPattern, 'library', null);
              openPatternViewer();
              return;
            }
            if (openRavelryBtn) {
              event.preventDefault();
              if (ravelryUrl) window.open(ravelryUrl, '_blank', 'noopener');
              return;
            }
            if (refreshRavelryBtn) {
              event.preventDefault();
              try {
                refreshRavelryBtn.disabled = true;
                refreshRavelryBtn.textContent = 'Refreshing...';
                var response = await fetch(ssRestBase + 'ravelry/import', {
                  method: 'POST',
                  credentials: 'same-origin',
                  cache: 'no-store',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-WP-Nonce': wpRestNonce
                  },
                  body: JSON.stringify({
                    id: ravelryId,
                    library_pattern_id: p.id,
                    pattern: {
                      id: ravelryId,
                      title: p.title || '',
                      craft_type: p.craft_type || '',
                      designer: meta.designer || '',
                      thumbnail_url: meta.thumbnail_url || '',
                      url: ravelryUrl
                    }
                  })
                });
                var refreshed = await ssParseJsonResponse(response);
                if (!response.ok || !refreshed.success) throw new Error(refreshed.error || refreshed.message || 'Ravelry refresh failed.');
                await fetchLibrary({ page: 1, per_page: 50 });
                await openPatternDetail(p.id);
              } catch (err) {
                refreshRavelryBtn.disabled = false;
                refreshRavelryBtn.textContent = 'Refresh from Ravelry';
                alert(err && err.message ? err.message : 'Ravelry refresh failed.');
              }
              return;
            }
	            if (chatBtn || reworkBtn || sessionBtn) {
	              event.preventDefault();
	              modal.hidden = true;
	              document.body.classList.remove('ss-library-detail-open');
	              await loadPatternFromLibrary(
	                p,
	                reworkBtn ? 'rework' : 'chat',
	                sessionBtn ? sessionBtn.getAttribute('data-ss-library-open-chat') : null,
	                messageIdToFocus,
	                { fresh: !!(chatBtn || reworkBtn) && !sessionBtn }
	              );
	              if (chatBtn) usePrompt(ssDefaultStepGuidePrompt);
            } else if (downloadBtn) {
              event.preventDefault();
              var blob = new Blob([p.pattern_summary_text || p.pattern_summary_html || ''], { type: 'text/plain;charset=utf-8' });
              var url = URL.createObjectURL(blob);
              var a = document.createElement('a');
              a.href = url;
              a.download = String(p.title || 'pattern-summary').replace(/[^a-z0-9_-]+/gi, '_') + '_summary.txt';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } else if (archiveBtn) {
              event.preventDefault();
              if (!window.confirm('Archive this pattern?')) return;
              await libraryRequest('library/patterns/' + encodeURIComponent(p.id), { method: 'PUT', body: JSON.stringify({ is_archived: true }) });
              modal.hidden = true;
              document.body.classList.remove('ss-library-detail-open');
              fetchLibrary({ page: 1, per_page: 50 });
            } else if (deleteBtn) {
              event.preventDefault();
              if (!window.confirm('Delete this pattern and its saved history? This cannot be undone.')) return;
              await libraryRequest('library/patterns/' + encodeURIComponent(p.id) + '?hard=true', { method: 'DELETE' });
              modal.hidden = true;
              document.body.classList.remove('ss-library-detail-open');
              fetchLibrary({ page: 1, per_page: 50 });
            } else if (notesBtn || progressBtn) {
              event.preventDefault();
              var noteInput = qs(body, '[data-ss-library-note-new]');
              var progress = qs(body, '[data-ss-library-progress]');
              var notesStatus = qs(body, '[data-ss-library-notes-status]');
              var notesList = qs(body, '[data-ss-library-notes-list]');
              var noteText = noteInput ? noteInput.value.trim() : '';
              if (notesBtn && !noteText) {
                if (notesStatus) notesStatus.textContent = 'Write a note first.';
                return;
              }
              if (noteText) {
                projectNotes.push({
                  id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                  text: noteText,
                  created_at: new Date().toISOString(),
                  author: currentUserName || 'You'
                });
              }
              var nextMeta = Object.assign({}, meta, {
                notes: '',
                notes_entries: projectNotes,
                progress_status: progress ? progress.value : '',
                notes_updated_at: new Date().toISOString()
              });
              await libraryRequest('library/patterns/' + encodeURIComponent(p.id), {
                method: 'PUT',
                body: JSON.stringify({ metadata: nextMeta })
              });
              meta = nextMeta;
              if (notesList) notesList.innerHTML = renderProjectNotes(projectNotes);
              if (noteInput) noteInput.value = '';
              if (notesStatus) notesStatus.textContent = noteText ? 'Note added.' : 'Progress saved.';
            }
          };
        } catch (err) {
          var debug = setLibraryDetailDebug('render', patternId, err, detailData);
          if (detailPattern && renderSimplePatternDetail(body, detailPattern, debug.stage + ': ' + debug.message)) return;
          body.innerHTML = '<div class="ss-library-detail-error">Could not load this pattern. Please try again.<br><small>Debug: ' + escapeHtml(debug.stage + ' - ' + debug.message) + '</small></div>';
        }
      }

      function fetchLibrary(params) {
        showState('loading');
        if (libSearch) params.search = libSearch.value.trim();
        params.craft = activeCraft;
        if (libSort) params.sort = libSort.value;

        var queryParts = [];
        Object.keys(params).forEach(function(k) {
          if (params[k]) queryParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
        });

        fetch(restUrl + 'library/patterns?' + queryParts.join('&'), {
          credentials: 'same-origin',
          headers: { 'X-WP-Nonce': wpRestNonce }
        })
        .then(function(r) {
          return r.text().then(function(raw) {
            var parsed = null;
            try { parsed = raw ? JSON.parse(raw) : {}; } catch (e) {}
            if (!r.ok) {
              var message = parsed && parsed.message ? parsed.message : (parsed && parsed.error ? parsed.error : ('HTTP ' + r.status));
              throw new Error(message);
            }
            if (!parsed) throw new Error('Library returned a non-JSON response.');
            return parsed;
          });
        })
        .then(function(data) {
          if (!data.success) throw new Error(data.error || 'Unknown error');
          libraryCache = data;
          renderCards(data.patterns);
        })
        .catch(function(err) {
          console.error('Library fetch error:', err);
          if (libError) {
            var p = libError.querySelector('p');
            if (p) p.textContent = 'Could not load your library: ' + (err && err.message ? err.message : 'Please try again.');
          }
          showState('error');
        });
      }

      function loadLibrary() {
        if (!isUserLoggedIn) {
          if (libAuth) libAuth.hidden = false;
          return;
        }
        if (libAuth) libAuth.hidden = true;
        fetchLibrary({ page: 1, per_page: 50 });
      }

      if (libSearch) {
        libSearch.addEventListener('input', function() {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function() { fetchLibrary({ page: 1, per_page: 50 }); }, 300);
        });
      }

      if (libSort) {
        libSort.addEventListener('change', function() { fetchLibrary({ page: 1, per_page: 50 }); });
      }

      if (libRetry) {
        libRetry.addEventListener('click', function(e) { e.preventDefault(); loadLibrary(); });
      }

      root.addEventListener('stitchsense-library-refresh', function() {
        if (isUserLoggedIn) fetchLibrary({ page: 1, per_page: 50 });
      });

      root.addEventListener('stitchsense-library-history-changed', function(event) {
        var patternId = event.detail && event.detail.pattern_id ? event.detail.pattern_id : libraryPatternId;
        if (patternId) refreshLibraryDetailHistory(patternId);
        if (isUserLoggedIn) fetchLibrary({ page: 1, per_page: 50 });
      });

      root.addEventListener('stitchsense-library-saved', function() {
        var migration = qs(root, '[data-ss-library-migration]');
        if (migration) migration.hidden = true;
        if (isUserLoggedIn) fetchLibrary({ page: 1, per_page: 50 });
      });

      root.addEventListener('stitchsense-library-save-failed', function(event) {
        var message = event.detail && event.detail.error ? event.detail.error : 'The pattern uploaded, but it was not saved to your library.';
        if (libError) {
          var p = libError.querySelector('p');
          if (p) p.textContent = 'Pattern uploaded, but library save failed: ' + message;
        }
        showState('error');
      });

      function initLibraryUtilityPanel() {
        var page = qs(root, '.ss-library-page');
        if (!page || qs(root, '[data-ss-library-settings]')) return;
        var panel = document.createElement('div');
        panel.className = 'ss-library-utilities';
        panel.setAttribute('data-ss-library-settings', '');
        panel.innerHTML =
          '<section class="ss-library-settings-card">' +
            '<h4>Library Settings</h4>' +
            '<label>Skill level<select data-ss-library-setting="default_skill"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>' +
            '<label>Measurements<select data-ss-library-setting="measurement_unit"><option value="metric">Metric</option><option value="imperial">Imperial</option></select></label>' +
            '<label>Terminology<select data-ss-library-setting="language"><option value="uk">UK English</option><option value="us">US English</option></select></label>' +
            '<p data-ss-library-settings-status></p>' +
          '</section>' +
	          '<section class="ss-library-settings-card ss-library-ravelry-card">' +
	            '<h4>Ravelry</h4>' +
	            '<p data-ss-ravelry-status>Checking Ravelry connection...</p>' +
	            '<div class="ss-library-data-actions">' +
	              '<button type="button" class="ss-secondary" data-ss-ravelry-connect>Connect Ravelry</button>' +
	              '<button type="button" class="ss-secondary" data-ss-ravelry-refresh>Status</button>' +
	            '</div>' +
	            '<div class="ss-ravelry-search" data-ss-ravelry-search-wrap hidden>' +
	              '<button type="button" class="ss-secondary" data-ss-ravelry-open-search>Search Ravelry</button>' +
	              '<button type="button" class="ss-secondary" data-ss-ravelry-open-saved>Import my Patterns</button>' +
	            '</div>' +
	          '</section>' +
	          '<section class="ss-library-settings-card">' +
            '<h4>Data & Migration</h4>' +
            '<div class="ss-library-migration" data-ss-library-migration hidden></div>' +
            '<div class="ss-library-data-actions">' +
              '<button type="button" class="ss-secondary" data-ss-library-export>Export My Data</button>' +
              '<button type="button" class="ss-secondary ss-danger" data-ss-library-delete-data>Delete My Library Data</button>' +
            '</div>' +
          '</section>';
        page.appendChild(panel);

        var status = qs(panel, '[data-ss-library-settings-status]');
        function setStatus(text) { if (status) status.textContent = text || ''; }
	        var ravelryStatus = qs(panel, '[data-ss-ravelry-status]');
	        var ravelryConnectBtn = qs(panel, '[data-ss-ravelry-connect]');
	        var ravelryHeaderConnectBtn = qs(root, '[data-ss-ravelry-connect-header]');
	        var ravelrySearchWrap = qs(panel, '[data-ss-ravelry-search-wrap]');
	        var ravelryConnectedUsername = '';
	        function setRavelryStatus(text) { if (ravelryStatus) ravelryStatus.textContent = text || ''; }

        var ravelryBrowser = {
          modal: null,
          mode: 'search',
          page: 1,
          pageSize: 24,
          query: '',
          patterns: [],
          pagination: null,
          message: '',
          loading: false,
          verifyToken: 0
        };

        function isRavelryPatternImported(pattern) {
          return !!getImportedRavelryPatternId(pattern);
        }

        function getImportedRavelryPatternId(pattern) {
          if (!pattern) return false;
          if (pattern.library_pattern_id) return String(pattern.library_pattern_id);
          if (!libraryCache || !Array.isArray(libraryCache.patterns)) return '';
          var id = String(pattern.id || pattern.pattern_id || '').trim();
          var url = normaliseRavelryPatternUrl(pattern.url || pattern.permalink || '');
          var patterns = libraryCache.patterns;
          for (var i = 0; i < patterns.length; i++) {
            var item = patterns[i] || {};
            var meta = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
            if (id && String(meta.ravelry_id || '').trim() === id) return String(item.id || '');
            if (url && normaliseRavelryPatternUrl(meta.ravelry_url || meta.url || meta.source_url || '') === url) return String(item.id || '');
          }
          return '';
        }

        function ravelrySummaryText(pattern) {
          var lines = ['Imported from Ravelry.'];
          if (pattern.designer) lines.push('Designer: ' + pattern.designer);
          if (pattern.craft_type) lines.push('Craft: ' + pattern.craft_type);
          if (pattern.gauge) lines.push('Gauge: ' + pattern.gauge);
          if (pattern.sizes) lines.push('Sizes: ' + pattern.sizes);
          if (pattern.yardage) lines.push('Yardage: ' + pattern.yardage);
          if (pattern.notes) lines.push('', pattern.notes);
          if (pattern.pdf_url) lines.push('', 'A PDF/download URL was returned by Ravelry and linked to this library item.');
          else lines.push('', 'Ravelry did not expose a PDF/download URL for this pattern through the connected API response. Open the Ravelry listing for the original pattern page.');
          return lines.join('\n');
        }

        function ravelrySummaryHtml(pattern) {
          var text = ravelrySummaryText(pattern);
          return '<div class="ss-pattern-summary-html">' + text.split(/\n+/).filter(Boolean).map(function(line) {
            return '<p>' + escapeHtml(line) + '</p>';
          }).join('') + '</div>';
        }

	        function ravelryResultAvailabilityBadge(pattern) {
	          var availability = String((pattern && pattern.availability) || '').toLowerCase();
	          if (availability === 'free' || availability === 'free download' || (pattern && pattern.is_free === true)) {
	            return '<span class="ss-ravelry-availability ss-badge-free">Free</span>';
	          }
	          if (availability === 'paid' || availability === 'purchase' || availability === 'buy' || (pattern && normaliseRavelryPatternUrl(pattern.url || pattern.permalink || '') && !pattern.pdf_url)) {
	            return '<span class="ss-ravelry-availability ss-badge-paid">Paid</span>';
	          }
	          return '<span class="ss-ravelry-availability ss-badge-paid">Paid</span>';
	        }

        async function fetchRavelryDetail(pattern) {
          if (!pattern || !pattern.id) return pattern || {};
          try {
            var response = await fetch(ravelryPatternEndpoint + '?id=' + encodeURIComponent(pattern.id), {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { 'Accept': 'application/json', 'X-WP-Nonce': wpRestNonce }
            });
            var data = await ssParseJsonResponse(response);
            if (data && data.success && data.pattern) {
              return Object.assign({}, pattern, data.pattern, {
                availability_verified: true,
                thumbnail_url: data.pattern.thumbnail_url || pattern.thumbnail_url || '',
                url: normaliseRavelryPatternUrl(data.pattern.url || pattern.url || '')
              });
            }
          } catch (err) {
            if (window.ssDebug === true) console.warn('StitchSense Ravelry detail failed:', err);
          }
          return pattern;
        }

        async function verifyVisibleRavelryAvailability() {
          if (!ravelryBrowser.patterns || !ravelryBrowser.patterns.length) return;
          var token = ++ravelryBrowser.verifyToken;
          var changed = false;
          var checks = ravelryBrowser.patterns.map(async function(pattern, index) {
            if (!pattern || pattern.availability_verified || !pattern.id) return;
            try {
              var detail = await fetchRavelryDetail(pattern);
              if (token !== ravelryBrowser.verifyToken) return;
              ravelryBrowser.patterns[index] = Object.assign({}, pattern, detail, { availability_verified: true });
              changed = true;
            } catch (err) {
              if (token !== ravelryBrowser.verifyToken) return;
              pattern.availability_verified = true;
              changed = true;
              if (window.ssDebug === true) console.warn('StitchSense Ravelry availability verify failed:', err);
            }
          });
          await Promise.all(checks);
          if (changed && token === ravelryBrowser.verifyToken) renderRavelryModal();
        }

        async function importRavelryPattern(pattern, btn, options) {
          options = options || {};
          if (!pattern) return;
          var originalLabel = btn ? btn.textContent : '';
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Importing...';
          }
          try {
            var response = await fetch(ssRestBase + 'ravelry/import', {
              method: 'POST',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-WP-Nonce': wpRestNonce
              },
              body: JSON.stringify({
                id: pattern.id || '',
                library_pattern_id: getImportedRavelryPatternId(pattern) || '',
                pattern: pattern
              })
            });
            var data = await ssParseJsonResponse(response);
            if (!response.ok || !data.success) throw new Error(data.error || data.message || 'Ravelry import failed.');
            pattern.imported = true;
            pattern.is_imported = true;
            pattern.library_pattern_id = data.id || data.pattern_id || (data.pattern && data.pattern.id) || pattern.library_pattern_id || '';
            if (btn) {
              btn.textContent = 'Re-import';
              btn.disabled = false;
              var card = btn.closest('.ss-ravelry-card');
              if (card) card.classList.add('is-imported');
            }
            var statusMessage = 'Ravelry pattern imported to your library.';
            if (data.pdf_saved && data.analysis_succeeded) statusMessage = 'Ravelry PDF imported and summarised.';
            else if (data.pdf_saved) statusMessage = 'Ravelry PDF imported. Summary used available Ravelry metadata because analysis did not complete.';
            else if (data.download_error) statusMessage = 'Ravelry pattern imported, but the PDF could not be saved: ' + data.download_error;
            setRavelryStatus(statusMessage);
            if (!options.skipRefresh) fetchLibrary({ page: 1, per_page: 50 });
          } catch (err) {
            if (btn) {
              btn.disabled = false;
              btn.textContent = originalLabel || 'Import';
            }
            setRavelryStatus(err && err.message ? err.message : 'Import failed.');
            throw err;
          }
        }

        function ensureRavelryModal() {
          if (ravelryBrowser.modal) return ravelryBrowser.modal;
          var modal = document.createElement('div');
          modal.className = 'ss-hub ss-ravelry-modal';
          modal.hidden = true;
          modal.innerHTML =
            '<div class="ss-ravelry-backdrop" data-ss-ravelry-close></div>' +
            '<section class="ss-ravelry-dialog" role="dialog" aria-modal="true" aria-label="Ravelry browser">' +
              '<header class="ss-ravelry-header">' +
                '<div><h3 data-ss-ravelry-title>Ravelry</h3><p data-ss-ravelry-meta></p></div>' +
                '<button type="button" class="ss-icon-btn" data-ss-ravelry-close aria-label="Close Ravelry browser">&times;</button>' +
              '</header>' +
              '<div class="ss-ravelry-toolbar">' +
                '<label data-ss-ravelry-query-wrap>Search<input type="search" data-ss-ravelry-modal-query placeholder="Sweater, socks, shawl..."></label>' +
                '<label>Craft<select data-ss-ravelry-filter="craft"><option value="">Any craft</option><option value="knitting">Knitting</option><option value="crochet">Crochet</option></select></label>' +
                '<label>Weight<select data-ss-ravelry-filter="weight"><option value="">Any weight</option><option value="lace">Lace</option><option value="fingering">Super Fine</option><option value="sport">Fine / Sport</option><option value="dk">Light / DK</option><option value="worsted">Worsted</option><option value="bulky">Bulky / Chunky</option><option value="super-bulky">Super Chunky</option><option value="jumbo">Jumbo</option></select></label>' +
	                '<label>Availability<select data-ss-ravelry-filter="availability"><option value="">Any</option><option value="free">Free</option><option value="paid">Paid</option></select></label>' +
                '<label>Sort<select data-ss-ravelry-filter="sort"><option value="">Best match</option><option value="popularity">Popularity</option><option value="created">Newest</option><option value="favorites">Most saved</option></select></label>' +
                '<label>Per page<select data-ss-ravelry-page-size><option value="12">12</option><option value="24" selected>24</option><option value="36">36</option><option value="48">48</option></select></label>' +
                '<button type="button" class="ss-standard-btn ss-go-btn" data-ss-ravelry-run>Search</button>' +
              '</div>' +
              '<div class="ss-ravelry-bulk">' +
                '<button type="button" class="ss-secondary" data-ss-ravelry-import-page>Import Shown</button>' +
                '<button type="button" class="ss-secondary" data-ss-ravelry-import-all-saved hidden>Import All My Patterns</button>' +
              '</div>' +
              '<div class="ss-ravelry-message" data-ss-ravelry-message></div>' +
              '<div class="ss-ravelry-grid" data-ss-ravelry-grid></div>' +
              '<footer class="ss-ravelry-pagination">' +
                '<button type="button" class="ss-secondary" data-ss-ravelry-prev>Previous</button>' +
                '<span data-ss-ravelry-page-label>Page 1</span>' +
                '<button type="button" class="ss-secondary" data-ss-ravelry-next>Next</button>' +
              '</footer>' +
            '</section>';
          document.body.appendChild(modal);
          ravelryBrowser.modal = modal;

          modal.addEventListener('click', async function(event) {
            var close = event.target.closest('[data-ss-ravelry-close]');
            if (close) {
              event.preventDefault();
              modal.hidden = true;
              return;
            }
            var importBtn = event.target.closest('[data-ss-ravelry-import-one]');
            if (importBtn) {
              event.preventDefault();
              var index = parseInt(importBtn.getAttribute('data-ss-ravelry-index') || '-1', 10);
              importRavelryPattern(ravelryBrowser.patterns[index], importBtn).catch(function() {});
              return;
            }
            var openPatternBtn = event.target.closest('[data-ss-ravelry-open-one]');
            if (openPatternBtn) {
              event.preventDefault();
              var openIndex = parseInt(openPatternBtn.getAttribute('data-ss-ravelry-index') || '-1', 10);
              var openPattern = ravelryBrowser.patterns[openIndex] || {};
              var openUrl = normaliseRavelryPatternUrl(openPattern.url || openPattern.permalink || '');
              if (openUrl) window.open(openUrl, '_blank', 'noopener');
              return;
            }
            var prev = event.target.closest('[data-ss-ravelry-prev]');
            if (prev) {
              event.preventDefault();
              if (ravelryBrowser.pagination && ravelryBrowser.pagination.has_prev) loadRavelryPage(ravelryBrowser.page - 1);
              return;
            }
            var next = event.target.closest('[data-ss-ravelry-next]');
            if (next) {
              event.preventDefault();
              if (!ravelryBrowser.pagination || ravelryBrowser.pagination.has_next) loadRavelryPage(ravelryBrowser.page + 1);
              return;
            }
            var run = event.target.closest('[data-ss-ravelry-run]');
            if (run) {
              event.preventDefault();
              loadRavelryPage(1);
              return;
            }
            var importPage = event.target.closest('[data-ss-ravelry-import-page]');
            if (importPage) {
              event.preventDefault();
              await importRavelryPatternList(ravelryBrowser.patterns, importPage, 'Import Shown');
              return;
            }
            var importAll = event.target.closest('[data-ss-ravelry-import-all-saved]');
            if (importAll) {
              event.preventDefault();
              await importAllSavedRavelry(importAll);
            }
          });

          var queryInput = qs(modal, '[data-ss-ravelry-modal-query]');
          if (queryInput) queryInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
              event.preventDefault();
              loadRavelryPage(1);
            }
          });
          qsa(modal, '[data-ss-ravelry-filter], [data-ss-ravelry-page-size]').forEach(function(input) {
            input.addEventListener('change', function() { loadRavelryPage(1); });
          });
          return modal;
        }

        function renderRavelryModal() {
          var modal = ensureRavelryModal();
          var title = qs(modal, '[data-ss-ravelry-title]');
          var meta = qs(modal, '[data-ss-ravelry-meta]');
          var grid = qs(modal, '[data-ss-ravelry-grid]');
          var message = qs(modal, '[data-ss-ravelry-message]');
          var pageLabel = qs(modal, '[data-ss-ravelry-page-label]');
          var prev = qs(modal, '[data-ss-ravelry-prev]');
          var next = qs(modal, '[data-ss-ravelry-next]');
          var queryWrap = qs(modal, '[data-ss-ravelry-query-wrap]');
          var importAll = qs(modal, '[data-ss-ravelry-import-all-saved]');
          var p = ravelryBrowser.pagination || {};
          if (title) title.textContent = ravelryBrowser.mode === 'saved' ? 'Import My Ravelry Patterns' : 'Search Ravelry';
          if (queryWrap) queryWrap.hidden = ravelryBrowser.mode === 'saved';
          if (importAll) importAll.hidden = ravelryBrowser.mode !== 'saved';
          if (pageLabel) pageLabel.textContent = 'Page ' + (p.page || ravelryBrowser.page) + (p.page_count ? ' of ' + p.page_count : '');
          if (prev) prev.disabled = !p.has_prev || ravelryBrowser.loading;
          if (next) next.disabled = ravelryBrowser.loading || (p.has_next === false);
          if (meta) {
            var total = p.total_count ? Number(p.total_count).toLocaleString() + ' found' : (p.returned_count || ravelryBrowser.patterns.length) + ' shown';
            meta.textContent = ravelryBrowser.loading ? 'Loading Ravelry patterns...' : total;
          }
          if (message && !ravelryBrowser.loading) message.textContent = ravelryBrowser.message || '';
          if (!grid) return;
          if (ravelryBrowser.loading) {
            grid.innerHTML = '<p class="ss-ravelry-empty">Loading Ravelry patterns...</p>';
            return;
          }
          if (!ravelryBrowser.patterns.length) {
            grid.innerHTML = '<p class="ss-ravelry-empty">No Ravelry patterns found.</p>';
            return;
          }
          grid.innerHTML = ravelryBrowser.patterns.map(function(pattern, index) {
            var ravelryUrl = normaliseRavelryPatternUrl(pattern.url || pattern.permalink || '');
            var isImported = isRavelryPatternImported(pattern);
            return '<article class="ss-ravelry-card' + (isImported ? ' is-imported' : '') + '">' +
              '<div class="ss-ravelry-card-thumb">' + (pattern.thumbnail_url ? '<img src="' + escapeHtml(pattern.thumbnail_url) + '" alt="" loading="lazy">' : '<span>R</span>') + '</div>' +
              '<div class="ss-ravelry-card-body">' +
                '<h4>' + escapeHtml(pattern.title || 'Untitled Ravelry pattern') + '</h4>' +
                (pattern.designer ? '<p>by ' + escapeHtml(pattern.designer) + '</p>' : '') +
                '<div class="ss-ravelry-card-tags">' +
                  ravelryResultAvailabilityBadge(pattern) +
                  (pattern.craft_type ? '<span>' + escapeHtml(pattern.craft_type) + '</span>' : '') +
                  (pattern.pdf_url ? '<span>PDF</span>' : '') +
                  (ravelryUrl ? '<a href="' + escapeHtml(ravelryUrl) + '" target="_blank" rel="noopener">Ravelry</a>' : '') +
                '</div>' +
              '</div>' +
              (ravelryUrl ? '<button type="button" class="ss-secondary ss-ravelry-open-link" data-ss-ravelry-open-one data-ss-ravelry-index="' + index + '">View / Buy on Ravelry</button>' : '') +
              '<button type="button" class="ss-secondary" data-ss-ravelry-import-one data-ss-ravelry-index="' + index + '">' + (isImported ? 'Re-import' : 'Import') + '</button>' +
            '</article>';
          }).join('');
        }

        function collectRavelryParams(page) {
          var modal = ensureRavelryModal();
          var params = new URLSearchParams();
          params.set('page', String(page || 1));
          var pageSizeInput = qs(modal, '[data-ss-ravelry-page-size]');
          ravelryBrowser.pageSize = parseInt(pageSizeInput && pageSizeInput.value || '24', 10) || 24;
          params.set('page_size', String(ravelryBrowser.pageSize));
	          if (ravelryBrowser.mode === 'search') {
	            var queryInput = qs(modal, '[data-ss-ravelry-modal-query]');
	            ravelryBrowser.query = queryInput ? queryInput.value.trim() : '';
	            params.set('q', ravelryBrowser.query);
	            qsa(modal, '[data-ss-ravelry-filter]').forEach(function(input) {
	              if (input.value) params.set(input.getAttribute('data-ss-ravelry-filter'), input.value);
	            });
	          } else if (ravelryBrowser.mode === 'saved') {
	            var username = ravelryConnectedUsername;
	            if (username) params.set('username', username);
	          }
          return params;
        }

        async function loadRavelryPage(page) {
          var modal = ensureRavelryModal();
          var message = qs(modal, '[data-ss-ravelry-message]');
          var params = collectRavelryParams(page);
          if (ravelryBrowser.mode === 'search' && !params.get('q')) {
            ravelryBrowser.message = 'Enter a Ravelry search term first.';
            if (message) message.textContent = ravelryBrowser.message;
            return;
          }
          ravelryBrowser.message = '';
          ravelryBrowser.loading = true;
          ravelryBrowser.page = page || 1;
          renderRavelryModal();
          try {
            var endpoint = ravelryBrowser.mode === 'saved' ? ravelrySavedEndpoint : ravelrySearchEndpoint;
            var response = await fetch(endpoint + '?' + params.toString(), {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { 'Accept': 'application/json', 'X-WP-Nonce': wpRestNonce }
            });
            var data = await ssParseJsonResponse(response);
            if (!data.success) throw new Error(data.error || 'Ravelry request failed.');
            ravelryBrowser.patterns = (data.patterns || []).map(function(pattern) {
              return Object.assign({}, pattern, { availability_verified: !!(pattern && pattern.pdf_url) });
            });
            ravelryBrowser.pagination = data.pagination || { page: ravelryBrowser.page, returned_count: ravelryBrowser.patterns.length };
          } catch (err) {
            ravelryBrowser.patterns = [];
            ravelryBrowser.pagination = { page: ravelryBrowser.page, returned_count: 0, has_prev: ravelryBrowser.page > 1, has_next: false };
            ravelryBrowser.message = err && err.message ? err.message : 'Ravelry request failed.';
          } finally {
            ravelryBrowser.loading = false;
            renderRavelryModal();
            verifyVisibleRavelryAvailability().catch(function(err) {
              if (window.ssDebug === true) console.warn('StitchSense Ravelry verification batch failed:', err);
            });
          }
        }

        async function importRavelryPatternList(patterns, btn, defaultLabel) {
          if (!patterns || !patterns.length) return;
          var label = defaultLabel || (btn ? btn.textContent : 'Import');
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Importing 0/' + patterns.length + '...';
          }
          for (var i = 0; i < patterns.length; i++) {
            if (btn) btn.textContent = 'Importing ' + (i + 1) + '/' + patterns.length + '...';
            try { await importRavelryPattern(patterns[i], null, { skipRefresh: true }); } catch (err) {}
          }
          if (btn) {
            btn.disabled = false;
            btn.textContent = label;
          }
          fetchLibrary({ page: 1, per_page: 50 });
        }

        async function importAllSavedRavelry(btn) {
          var p = ravelryBrowser.pagination || {};
          var totalPages = p.page_count || ravelryBrowser.page;
          var ok = window.confirm('Import all saved Ravelry patterns across ' + totalPages + ' page' + (totalPages === 1 ? '' : 's') + '? This may take a while.');
          if (!ok) return;
          var original = btn.textContent;
          btn.disabled = true;
          try {
            for (var page = 1; page <= totalPages; page++) {
              btn.textContent = 'Importing saved page ' + page + '/' + totalPages + '...';
              ravelryBrowser.mode = 'saved';
              await loadRavelryPage(page);
              await importRavelryPatternList(ravelryBrowser.patterns, null, '');
            }
          } finally {
            btn.disabled = false;
            btn.textContent = original;
            fetchLibrary({ page: 1, per_page: 50 });
          }
        }

        function openRavelryBrowser(mode) {
          var modal = ensureRavelryModal();
          ravelryBrowser.mode = mode || 'search';
          ravelryBrowser.page = 1;
          ravelryBrowser.patterns = [];
          ravelryBrowser.pagination = null;
          modal.hidden = false;
          renderRavelryModal();
          if (ravelryBrowser.mode === 'saved') {
            loadRavelryPage(1);
          } else {
            var query = qs(modal, '[data-ss-ravelry-modal-query]');
            if (query) setTimeout(function() { query.focus(); }, 50);
          }
        }

	        async function refreshRavelryStatus() {
	          if (!ravelryStatusEndpoint) return;
	          try {
            const response = await fetch(ravelryStatusEndpoint, {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { 'Accept': 'application/json', 'X-WP-Nonce': wpRestNonce }
            });
	            const data = await ssParseJsonResponse(response);
		            var savedBtns = qsa(root, '[data-ss-ravelry-open-saved]');
		            var headerSearchBtns = qsa(root, '.ss-library-hero-actions [data-ss-ravelry-open-search]');
		            function setSavedDisabled(disabled) {
		              savedBtns.forEach(function(btn) { btn.disabled = !!disabled; });
		            }
		            function setHeaderMode(mode) {
		              if (ravelryHeaderConnectBtn) ravelryHeaderConnectBtn.hidden = mode !== 'connect';
		              headerSearchBtns.forEach(function(btn) { btn.hidden = mode !== 'connected'; });
		              savedBtns.forEach(function(btn) {
		                if (btn.closest('.ss-library-hero-actions')) btn.hidden = mode !== 'connected';
		              });
		            }
		            if (!data.configured) {
		              setRavelryStatus('Ravelry is not configured by the site admin yet.');
		              if (ravelryConnectBtn) ravelryConnectBtn.disabled = true;
		              if (ravelryHeaderConnectBtn) ravelryHeaderConnectBtn.disabled = true;
		              if (ravelrySearchWrap) ravelrySearchWrap.hidden = true;
		              setSavedDisabled(true);
		              setHeaderMode('connect');
		              return;
		            }
		            if (data.connected) {
		              ravelryConnectedUsername = data.username || '';
		              setSavedDisabled(false);
		              setHeaderMode('connected');
		              if (data.api_ok) {
		                setRavelryStatus('Connected' + (data.username ? ' as ' + data.username : '') + '. Search Ravelry or import saved patterns.');
                if (ravelrySearchWrap) ravelrySearchWrap.hidden = false;
              } else {
                setRavelryStatus('Connected' + (data.username ? ' as ' + data.username : '') + '. Ravelry profile test warning: ' + (data.api_error || data.api_warning || 'check Ravelry API base/path settings.') + ' You can still try search/import.');
                if (ravelrySearchWrap) ravelrySearchWrap.hidden = false;
		              }
		              if (ravelryConnectBtn) ravelryConnectBtn.textContent = 'Reconnect Ravelry';
		              if (ravelryHeaderConnectBtn) ravelryHeaderConnectBtn.textContent = 'Connect Ravelry';
		            } else if (data.search_configured) {
		              setRavelryStatus(data.oauth_configured ? 'Ravelry search is available. Connect your account to import saved patterns.' : 'Ravelry Basic Auth search is available.');
		              if (ravelryConnectBtn) {
		                ravelryConnectBtn.disabled = !data.oauth_configured;
		                ravelryConnectBtn.textContent = data.oauth_configured ? 'Connect Ravelry' : 'Connect Ravelry unavailable';
		              }
		              if (ravelryHeaderConnectBtn) {
		                ravelryHeaderConnectBtn.disabled = !data.oauth_configured;
		                ravelryHeaderConnectBtn.textContent = data.oauth_configured ? 'Connect Ravelry' : 'Connect Ravelry unavailable';
		              }
		              if (ravelrySearchWrap) ravelrySearchWrap.hidden = false;
		              setSavedDisabled(true);
		              setHeaderMode('connect');
		            } else {
		              setRavelryStatus('Ravelry is configured. Connect your account to import and link pattern data.');
		              if (ravelryConnectBtn) ravelryConnectBtn.disabled = false;
		              if (ravelryHeaderConnectBtn) ravelryHeaderConnectBtn.disabled = false;
		              if (ravelrySearchWrap) ravelrySearchWrap.hidden = true;
		              setSavedDisabled(true);
		              setHeaderMode('connect');
		            }
          } catch (err) {
            setRavelryStatus('Ravelry status could not be loaded.');
          }
        }

        if (!isUserLoggedIn) {
          setStatus('Log in to save settings and manage library data.');
          qsa(panel, 'select, button').forEach(function(el) { el.disabled = true; });
          return;
        }

	        refreshRavelryStatus();
	        var ravelryRefreshBtn = qs(panel, '[data-ss-ravelry-refresh]');
	        if (ravelryRefreshBtn) ravelryRefreshBtn.addEventListener('click', function(event) {
	          event.preventDefault();
	          setRavelryStatus('Checking Ravelry connection...');
	          refreshRavelryStatus();
	        });
	        qsa(root, '[data-ss-ravelry-connect], [data-ss-ravelry-connect-header]').forEach(function(connectBtn) {
	          connectBtn.addEventListener('click', async function(event) {
	            event.preventDefault();
	            try {
	              setRavelryStatus('Preparing Ravelry sign-in...');
	              const response = await fetch(ravelryConnectEndpoint, {
	                method: 'POST',
	                credentials: 'same-origin',
	                cache: 'no-store',
	                headers: { 'Accept': 'application/json', 'X-WP-Nonce': wpRestNonce }
	              });
	              const data = await ssParseJsonResponse(response);
	              if (!data.success || !data.url) throw new Error(data.error || 'Ravelry could not be connected yet.');
	              var width = Math.min(720, Math.max(420, Math.floor(window.screen.width * 0.72)));
	              var height = Math.min(760, Math.max(560, Math.floor(window.screen.height * 0.78)));
	              var left = Math.max(0, Math.floor((window.screen.width - width) / 2));
	              var top = Math.max(0, Math.floor((window.screen.height - height) / 2));
	              var popup = window.open(data.url, 'stitchsense-ravelry-oauth', 'popup=yes,width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes');
	              if (!popup) {
	                setRavelryStatus('Popup was blocked. Please allow popups for this site, then try Connect Ravelry again.');
	                return;
	              }
	              setRavelryStatus('Ravelry sign-in opened in a popup. Complete the approval there.');
	              var popupPoll = window.setInterval(function() {
	                if (!popup || !popup.closed) return;
	                window.clearInterval(popupPoll);
	                setRavelryStatus('Checking Ravelry connection...');
	                refreshRavelryStatus();
	              }, 1000);
	            } catch (err) {
	              setRavelryStatus(err && err.message ? err.message : 'Ravelry could not be connected yet.');
	            }
	          });
	        });

        window.addEventListener('message', function(event) {
          if (event.origin !== window.location.origin) return;
          var data = event.data || {};
          if (!data || data.source !== 'stitchsense-ravelry-oauth') return;
          setRavelryStatus(data.message || (data.success ? 'Ravelry connected.' : 'Ravelry connection failed.'));
          refreshRavelryStatus();
        });

	        var ravelrySearchBtns = qsa(root, '[data-ss-ravelry-open-search]');
	        var ravelrySavedBtns = qsa(root, '[data-ss-ravelry-open-saved]');
        ravelrySearchBtns.forEach(function(ravelrySearchBtn) {
          ravelrySearchBtn.addEventListener('click', function(event) {
            event.preventDefault();
            openRavelryBrowser('search');
          });
        });
	        ravelrySavedBtns.forEach(function(ravelrySavedBtn) {
	          ravelrySavedBtn.addEventListener('click', function(event) {
	            event.preventDefault();
	            openRavelryBrowser('saved');
	          });
	        });

	        libraryRequest('user/settings').then(function(data) {
          var settings = data.settings || {};
          qsa(panel, '[data-ss-library-setting]').forEach(function(input) {
            var key = input.getAttribute('data-ss-library-setting');
            if (settings[key]) input.value = settings[key];
          });
        }).catch(function() { setStatus('Settings could not be loaded.'); });

        var settingsTimer = null;
        qsa(panel, '[data-ss-library-setting]').forEach(function(input) {
          input.addEventListener('change', function() {
            clearTimeout(settingsTimer);
            settingsTimer = setTimeout(function() {
              var payload = {};
              qsa(panel, '[data-ss-library-setting]').forEach(function(field) {
                payload[field.getAttribute('data-ss-library-setting')] = field.value;
              });
              setStatus('Saving settings...');
              libraryRequest('user/settings', { method: 'PUT', body: JSON.stringify(payload) })
                .then(function(){ setStatus('Settings saved.'); })
                .catch(function(){ setStatus('Settings could not be saved.'); });
            }, 250);
          });
        });

        var migration = qs(panel, '[data-ss-library-migration]');
        var hasLocalPattern = !!(uploadedProject && uploadedProject.project_id && !libraryPatternId);
        if (migration && hasLocalPattern) {
          migration.hidden = false;
          migration.innerHTML = '<p>Browser-saved pattern/chat data was found. Move it into your account library?</p><button type="button" class="ss-standard-btn ss-go-btn" data-ss-library-migrate>Migrate Now</button><button type="button" class="ss-secondary" data-ss-library-migrate-dismiss>Not Now</button>';
        }
        var migrateBtn = qs(panel, '[data-ss-library-migrate]');
        if (migrateBtn) migrateBtn.addEventListener('click', async function(event) {
          event.preventDefault();
          migration.innerHTML = '<p>Migrating browser-saved data...</p>';
          await saveActivePatternToLibrary('upload');
          if (libraryPatternId && history.length) {
            await ensureLibraryChatSession();
            var messagesToSave = history.map(function(msg) {
              return { role: msg.role || 'assistant', kind: msg.kind || 'message', content: msg.content || '', tool_mode: msg.kind === 'pattern_summary' ? 'pattern_summary' : '' };
            });
            try {
              await libraryRequest('library/chats/' + encodeURIComponent(activeChatSessionId) + '/messages', {
                method: 'PUT',
                body: JSON.stringify({ messages: messagesToSave })
              });
            } catch (err) {}
          }
          migration.innerHTML = '<p>Migration complete. Your browser-saved work is now attached to your account.</p>';
          fetchLibrary({ page: 1, per_page: 50 });
        });
        var dismissBtn = qs(panel, '[data-ss-library-migrate-dismiss]');
        if (dismissBtn) dismissBtn.addEventListener('click', function(event) {
          event.preventDefault();
          migration.hidden = true;
        });

        var exportBtn = qs(panel, '[data-ss-library-export]');
        if (exportBtn) exportBtn.addEventListener('click', async function(event) {
          event.preventDefault();
          try {
            var data = await libraryRequest('user/export');
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'stitchsense-library-export.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (err) {
            setStatus('Export failed. Please try again.');
          }
        });
        var deleteDataBtn = qs(panel, '[data-ss-library-delete-data]');
        if (deleteDataBtn) deleteDataBtn.addEventListener('click', async function(event) {
          event.preventDefault();
          var confirmation = window.prompt('Type DELETE to permanently delete your StitchSense library data.');
          if (confirmation !== 'DELETE') return;
          try {
            await libraryRequest('user/delete-data', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) });
            setLibraryPatternId('');
            setActiveChatSessionId('');
            setStatus('Library data deleted.');
            fetchLibrary({ page: 1, per_page: 50 });
          } catch (err) {
            setStatus('Delete failed. Please try again.');
          }
        });
      }

      root.addEventListener('click', function(event) {
        var craftBtn = event.target.closest('[data-ss-library-craft]');
        if (!craftBtn || !root.contains(craftBtn)) return;
        event.preventDefault();
        activeCraft = craftBtn.getAttribute('data-ss-library-craft') || 'all';
        qsa(root, '[data-ss-library-craft]').forEach(function(b) {
          b.classList.toggle('is-active', b.getAttribute('data-ss-library-craft') === activeCraft);
        });
        fetchLibrary({ page: 1, per_page: 50 });
      });

      root.addEventListener('click', function(event) {
        var card = event.target.closest('[data-ss-library-card]');
        if (!card || !root.contains(card)) return;
        var patternId = card.getAttribute('data-ss-library-card');
        if (!patternId) return;
        openPatternDetail(patternId, findLibraryPatternById(patternId));
      });

      initLibraryUtilityPanel();
      loadLibrary();
    }

  }

  document.addEventListener('DOMContentLoaded', function () {
    qsa(document, '[data-stitchsense-hub]').forEach(initHub);
  });
})();











/* StitchSense v7.6.0 */
