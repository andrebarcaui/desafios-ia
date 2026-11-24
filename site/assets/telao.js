/* Telão: placar ao vivo */
(function () {
  var C = Comum, el = C.el;
  var chave = null, est = null, nos = {}, raias = {}, ultimoFeed = 0, modo = '', ultimoSorteio = 0, primeira = true;

  function montar() {
    var app = C.limpar(document.getElementById('app'));
    nos.titulo = el('h1'); nos.sub = el('small', { texto: 'Desafios de IA: machine learning na prática' });
    nos.relogio = el('div.telao-relogio');
    nos.corpo = el('div');
    app.appendChild(el('div.telao', null, el('header.telao-cab', null, el('div', null, nos.sub, nos.titulo), nos.relogio), nos.corpo));
  }

  function atualizar() {
    return C.chamar('prof_placar', { chave: chave }).then(function (r) { est = r; C.sincronizar(r.agora); pintar(); })
      .catch(function () { nos.sub.textContent = 'Sem conexão com o servidor. Tentando de novo...'; });
  }

  function pintar() {
    nos.sub.textContent = 'Desafios de IA: machine learning na prática';
    nos.titulo.textContent = est.faseTitulo;
    C.pintarRelogio(nos.relogio, est.prazo);
    var novoModo = est.fase === 6 ? 'revelacao' : (est.fase === 5 && est.ficha ? 'ficha' : 'placar');
    if (novoModo !== modo) { modo = novoModo; C.limpar(nos.corpo); raias = {}; nos.raias = null; nos.ficha = null; }
    if (modo === 'placar') pintarPlacar();
    else if (modo === 'ficha') pintarFicha();
    else pintarRevelacao();
  }

  function pintarPlacar() {
    if (!nos.raias) {
      nos.raias = el('div.raias');
      nos.mural = el('ol');
      nos.sorteado = el('div');
      C.limpar(nos.corpo).appendChild(el('div.telao-corpo', null, el('div', null, nos.sorteado, nos.raias), el('aside.mural', null, el('h2', { texto: 'Acontecendo agora' }), nos.mural)));
    }
    pintarSorteado(nos.sorteado);
    if (!est.grupos.length) { C.limpar(nos.raias).appendChild(el('p.vazio-telao', { texto: 'Aguardando os grupos entrarem com seus códigos.' })); }
    var maior = Math.max(60, Math.max.apply(null, est.grupos.map(function (g) { return g.total; }).concat([0])));
    // FLIP: guarda posições antes
    var antes = {};
    for (var id in raias) antes[id] = raias[id].no.getBoundingClientRect().top;
    var vazio = nos.raias.querySelector('.vazio-telao'); if (vazio && est.grupos.length) vazio.remove();
    est.grupos.forEach(function (g) {
      var r = raias[g.id];
      if (!r) {
        r = { pos: el('div.raia-pos'), nome: el('b'), caso: el('small'), barra: el('i'), meta: el('div.raia-meta'), total: el('div.raia-total') };
        r.no = el('div.raia', null, r.pos, el('div.raia-nome', null, r.nome, r.caso), el('div', null, el('div.raia-barra', null, r.barra), r.meta), r.total);
        raias[g.id] = r;
      }
      r.pos.textContent = g.posicao + 'º';
      r.nome.textContent = g.nome;
      r.caso.textContent = g.caso;
      r.barra.style.width = Math.max(1, g.total / maior * 100) + '%';
      r.total.textContent = g.total;
      C.limpar(r.meta);
      ['f1', 'f2', 'f3', 'evento'].forEach(function (f) { r.meta.appendChild(el('span.passo' + (g.status[f] ? '.' + g.status[f] : ''), { title: f })); });
      if (g.metrica && g.metrica.treino) r.meta.appendChild(el('span.auc', { texto: g.metrica.treino + (g.metrica.producao ? ' no treino, ' + g.metrica.producao + ' em produção' : '') }));
      nos.raias.appendChild(r.no);
    });
    // FLIP: anima a troca de posições
    est.grupos.forEach(function (g) {
      var r = raias[g.id], a = antes[g.id];
      if (a == null || primeira) return;
      var d = a - r.no.getBoundingClientRect().top;
      if (Math.abs(d) > 2) { r.no.style.transition = 'none'; r.no.style.transform = 'translateY(' + d + 'px)'; r.no.offsetHeight; r.no.style.transition = ''; r.no.style.transform = ''; }
    });
    primeira = false;
    // Mural
    C.limpar(nos.mural);
    est.feed.slice().reverse().forEach(function (f) { nos.mural.appendChild(el('li.m-' + f.tipo, { texto: f.texto })); });
    est.feed.forEach(function (f) {
      if (f.id > ultimoFeed && f.tipo === 'queda') est.grupos.forEach(function (g) {
        if (f.texto.indexOf(g.nome + ':') === 0 && raias[g.id]) { var n = raias[g.id].no; n.classList.remove('caiu'); n.offsetHeight; n.classList.add('caiu'); }
      });
    });
    if (est.feed.length) ultimoFeed = est.feed[est.feed.length - 1].id;
  }

  function pintarSorteado(box) {
    C.limpar(box);
    if (!est.sorteio) return;
    var novo = est.sorteio.ts !== ultimoSorteio; ultimoSorteio = est.sorteio.ts;
    box.appendChild(el('div.sorteado' + (novo ? '.anima' : ''), { style: 'margin-bottom:1.25rem' },
      el('small', { texto: est.sorteio.grupo + ', quem responde é' }), el('b', { texto: est.sorteio.membro })));
  }

  function pintarFicha() {
    var chave = JSON.stringify(est.ficha) + (est.sorteio ? est.sorteio.ts : '');
    if (nos.ficha === chave) return;
    nos.ficha = chave;
    var lado = el('div');
    pintarSorteado(lado);
    C.limpar(nos.corpo).appendChild(el('div.telao-ficha', null, C.renderFicha(est.ficha), lado));
  }

  function pintarRevelacao() {
    var chave = JSON.stringify(est.revelacoes) + JSON.stringify(est.grupos.map(function (g) { return [g.nome, g.total]; }));
    if (nos.ficha === chave) return;
    nos.ficha = chave;
    C.limpar(nos.corpo).appendChild(el('div', null,
      el('div.armadilhas', null, (est.revelacoes || []).map(function (r) {
        return el('article.armadilha', null, el('small', { texto: r.caso + ', ' + (r.grupos.length > 1 ? r.grupos.slice(0, -1).join(', ') + ' e ' + r.grupos[r.grupos.length - 1] : r.grupos[0]) }), el('h2', { texto: r.armadilha.armadilha }),
          el('p', { texto: r.armadilha.resumo }), el('ul', null, r.armadilha.licoes.map(function (l) { return el('li', { texto: l }); })));
      })),
      el('h2', { style: 'margin-top:2rem', texto: 'Placar final' }),
      el('ol', { style: 'font-size:1.3rem;columns:2' }, est.grupos.map(function (g) { return el('li', { texto: g.nome + ': ' + g.total + ' pontos' }); }))));
  }

  C.areaProfessor('Telão', function (s) {
    chave = s;
    montar();
    atualizar();
    setInterval(atualizar, 3000);
    setInterval(function () { if (est) C.pintarRelogio(nos.relogio, est.prazo); }, 1000);
  });
})();
