/* Funções comuns às três telas */
var Comum = (function () {
  var cfg = window.DESAFIOS_CONFIG || {};
  var pai = null;
  try { if (window.parent !== window && window.parent.DEMO_SERVIDOR) pai = window.parent; } catch (e) { pai = null; }
  var demo = !!pai;

  function chamar(acao, dados) {
    var req = Object.assign({ acao: acao }, dados || {});
    var p;
    if (demo) {
      p = new Promise(function (ok) {
        setTimeout(function () { ok(JSON.parse(JSON.stringify(pai.DEMO_SERVIDOR.handle(JSON.parse(JSON.stringify(req)))))); }, 90);
      });
    } else {
      if (!cfg.apiUrl) return Promise.reject(new Error('O endereço do servidor não foi configurado (assets/config.js).'));
      p = fetch(cfg.apiUrl, { method: 'POST', body: JSON.stringify(req), redirect: 'follow' }).then(function (r) {
        if (!r.ok) throw new Error('O servidor respondeu com erro ' + r.status + '.');
        return r.json();
      });
    }
    return p.then(function (res) {
      if (res && res.erro) throw new Error(res.erro);
      return res;
    });
  }

  var casosCache = {};
  function carregarCaso(id) {
    if (casosCache[id]) return Promise.resolve(casosCache[id]);
    if (demo) return Promise.resolve(casosCache[id] = pai.DEMO_CASOS_PUBLICOS[id]);
    return fetch('casos/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Não foi possível carregar o caso.');
      return r.json();
    }).then(function (c) { casosCache[id] = c; return c; });
  }

  /* Montagem de elementos: el('div.classe', {atributos}, filhos...) */
  function el(spec, attrs) {
    var partes = spec.split('.'), tag = partes.shift() || 'div', no = document.createElement(tag);
    if (partes.length) no.className = partes.join(' ');
    var filhos = Array.prototype.slice.call(arguments, 2);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k.indexOf('on') === 0 && typeof v === 'function') no.addEventListener(k.slice(2), v);
      else if (k === 'texto') no.textContent = v;
      else if (k === 'dados') for (var d in v) no.dataset[d] = v[d];
      else no.setAttribute(k, v === true ? '' : v);
    }
    filhos.forEach(function add(f) {
      if (f == null || f === false) return;
      if (Array.isArray(f)) return f.forEach(add);
      no.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    });
    return no;
  }
  function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); return no; }

  var toastTimer = null;
  function toast(msg, erro) {
    var t = document.querySelector('.toast');
    if (!t) { t = el('div.toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, erro ? 5000 : 2800);
  }

  function guardar(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ler(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  /* Relógio sincronizado com o servidor */
  var desvio = 0;
  function sincronizar(agoraServidor) { if (agoraServidor) desvio = agoraServidor - Date.now(); }
  function restante(prazo) { return prazo ? Math.max(0, prazo - (Date.now() + desvio)) : null; }
  function fmtRelogio(ms) {
    if (ms == null) return '';
    var s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function pintarRelogio(no, prazo) {
    var r = restante(prazo);
    no.textContent = r == null ? '' : fmtRelogio(r);
    no.classList.toggle('apertado', r != null && r > 0 && r <= 60000);
    no.classList.toggle('zerado', r === 0);
  }

  function fmtAuc(x) { return x == null ? '' : (Math.round(x * 100) / 100).toFixed(2).replace('.', ','); }
  function fmtPct(x, casas) { return (x * 100).toFixed(casas == null ? 1 : casas).replace('.', ',') + '%'; }
  function fmtInt(x) { return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmtReais(x) { return (x < 0 ? '-R$ ' : 'R$ ') + fmtInt(Math.abs(x)); }

  /* Ficha do modelo (usada pelo aluno e pelo telão) */
  function renderFicha(f) {
    return el('article.ficha', null,
      el('div.ficha-cab', null, el('h2', { texto: 'Ficha do Modelo' }), el('span', { texto: f.grupo + ', ' + f.caso })),
      f.secoes.map(function (s) {
        return el('section.ficha-secao', null, el('h3', { texto: s.titulo }),
          el('dl', null, s.linhas.map(function (l) {
            return [el('dt', { texto: l.rotulo }), el('dd' + (l.codigo ? '.codigo' : '') + (l.citacao ? '.citacao' : ''), { texto: l.valor })];
          })));
      }));
  }

  return {
    demo: demo, chamar: chamar, carregarCaso: carregarCaso, el: el, limpar: limpar, toast: toast,
    guardar: guardar, ler: ler, sincronizar: sincronizar, restante: restante, fmtRelogio: fmtRelogio, pintarRelogio: pintarRelogio,
    fmtAuc: fmtAuc, fmtPct: fmtPct, fmtInt: fmtInt, fmtReais: fmtReais, renderFicha: renderFicha
  };
})();
