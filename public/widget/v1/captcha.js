/**
 * HCS-U7 Anti-Bot Widget SDK
 * Version 1.0.0
 */

(function(window) {
  'use strict';

  function getScriptOrigin() {
    try {
      var script = document.currentScript;
      if (!script) {
        var scripts = document.getElementsByTagName('script');
        script = scripts[scripts.length - 1];
      }
      if (script && script.src) {
        return new URL(script.src, window.location.href).origin;
      }
    } catch (e) {}
    return window.location.origin;
  }

  // Protection anti-debug et anti-copie
  (function() {
    // Bloquer clic droit
    document.addEventListener('contextmenu', function(e) {
      if (e.target.closest('#hcs-captcha-iframe, #hcs-captcha-overlay')) {
        e.preventDefault();
        return false;
      }
    });

    // Bloquer touches de debug sur l'iframe
    document.addEventListener('keydown', function(e) {
      var isDebugKey = e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'));
      
      if (isDebugKey && document.getElementById('hcs-captcha-iframe')) {
        e.preventDefault();
        return false;
      }
    });

    // Bloquer sélection de texte dans le widget
    var style = document.createElement('style');
    style.textContent = '#hcs-captcha-iframe, #hcs-captcha-overlay { user-select: none; -webkit-user-select: none; }';
    document.head.appendChild(style);
  })();

  const HCS = {
    version: '1.0.0',
    baseUrl: getScriptOrigin(),

    init: function(config) {
      this.config = {
        widgetId: config.widgetId || null,
        onSuccess: config.onSuccess || function() {},
        onError: config.onError || function() {},
        onClose: config.onClose || function() {},
        onRedirect: config.onRedirect || function() {},
        appId: config.appId || null,
        theme: config.theme || 'light',
        language: config.language || 'fr',
      };

      if (!this.config.widgetId) {
        console.error('[HCS] Widget ID is required');
        return;
      }

      this.setupMessageListener();
    },

    render: function(selector) {
      const container = typeof selector === 'string' 
        ? document.querySelector(selector)
        : selector;

      if (!container) {
        console.error('[HCS] Container not found:', selector);
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'hcs-captcha-iframe';
      var appIdParam = '';
      try {
        var appId = this.config.appId;
        if (!appId) {
          var params = new URLSearchParams(window.location.search);
          appId = params.get('appId');
        }
        if (appId) {
          appIdParam = '&appId=' + encodeURIComponent(appId);
        }
      } catch (e) {}

      iframe.src = this.baseUrl + '/widget/' + this.config.widgetId + '?theme=' + this.config.theme + '&lang=' + this.config.language + appIdParam;
      iframe.style.width = '100%';
      iframe.style.height = '600px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '8px';
      iframe.allow = 'microphone';

      container.innerHTML = '';
      container.appendChild(iframe);

      this.iframe = iframe;
    },

    showModal: function() {
      var self = this;
      
      var overlay = document.createElement('div');
      overlay.id = 'hcs-captcha-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';

      var modal = document.createElement('div');
      modal.style.cssText = 'width:100%;max-width:800px;position:relative;';

      var closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.style.cssText = 'position:absolute;top:-40px;right:0;background:white;border:none;font-size:32px;cursor:pointer;width:40px;height:40px;border-radius:50%;';
      closeBtn.onclick = function() { self.closeModal(); };

      var iframe = document.createElement('iframe');
      iframe.id = 'hcs-captcha-iframe';
      var appIdParam = '';
      try {
        var appId = this.config.appId;
        if (!appId) {
          var params = new URLSearchParams(window.location.search);
          appId = params.get('appId');
        }
        if (appId) {
          appIdParam = '&appId=' + encodeURIComponent(appId);
        }
      } catch (e) {}

      iframe.src = this.baseUrl + '/widget/' + this.config.widgetId + '?theme=' + this.config.theme + '&lang=' + this.config.language + appIdParam;
      iframe.style.cssText = 'width:100%;height:600px;border:none;border-radius:8px;background:white;';
      iframe.allow = 'microphone';

      modal.appendChild(closeBtn);
      modal.appendChild(iframe);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      this.iframe = iframe;
      this.overlay = overlay;
    },

    closeModal: function() {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      if (this.config.onClose) {
        this.config.onClose();
      }
    },

    setupMessageListener: function() {
      var self = this;
      
      window.addEventListener('message', function(event) {
        if (event.origin !== self.baseUrl) {
          return;
        }

        var data = event.data;
        console.log('[HCS SDK] Received message:', data);

        if (data.type === 'HCS_VERIFICATION_SUCCESS') {
          console.log('[HCS SDK] Verification success, calling onSuccess callback');
          if (self.config.onSuccess) {
            self.config.onSuccess(data.token, data.score);
          }

          if (self.config.onRedirect && data.redirectUrl) {
            self.config.onRedirect(data.redirectUrl);
          }
        }

        if (data.type === 'HCS_VERIFICATION_FAILED') {
          console.log('[HCS SDK] Verification failed');
          if (self.config.onError) {
            self.config.onError({
              error: data.error,
              score: data.score,
            });
          }

          if (self.overlay) {
            setTimeout(function() { self.closeModal(); }, 2000);
          }
        }

        if (data.type === 'HCS_VERIFICATION_ERROR') {
          console.log('[HCS SDK] Verification error');
          if (self.config.onError) {
            self.config.onError({
              error: data.error,
            });
          }

          if (self.overlay) {
            setTimeout(function() { self.closeModal(); }, 2000);
          }
        }

        if (data.type === 'HCS_VERIFICATION_REDIRECT') {
          console.log('[HCS SDK] Redirect message received');
          if (self.config.onRedirect) {
            self.config.onRedirect(data.redirectUrl);
          }
          if (data.redirectUrl) {
            window.location.href = data.redirectUrl;
          }
        }

        if (data.type === 'HCS_CLOSE_WIDGET') {
          console.log('[HCS SDK] Received close widget message');
          if (self.overlay) {
            console.log('[HCS SDK] Closing modal now');
            self.closeModal();
          }
        }
      });
    },
  };

  window.HCS = HCS;

  document.addEventListener('DOMContentLoaded', function() {
    var containers = document.querySelectorAll('[data-hcs-widget-id]');
    
    containers.forEach(function(container) {
      var widgetId = container.getAttribute('data-hcs-widget-id');
      var callback = container.getAttribute('data-hcs-callback');
      
      var hcs = Object.create(HCS);
      hcs.init({
        widgetId: widgetId,
        onSuccess: function(token, score) {
          if (callback && typeof window[callback] === 'function') {
            window[callback](token, score);
          }
        },
      });
      hcs.render(container);
    });
  });

})(window);
