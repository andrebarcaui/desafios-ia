/* Painel do professor */
(function () {
  var C = Comum, el = C.el;
  var CHAVE = 'desafios.professor';
  var chave = null, est = null, raiz = null, nos = {}, casos = {}, timer = null;

  function telaChave(erro) {
    raiz = C.limpar(document.getElementById('app'));
    var inp = el('input', { type: 'password', autocomplete: 'off', required: true, 'aria-label': 'Chave do professor' });
    var msg = el('div.aviso.aviso-erro' + (erro ? '' : '.oculto'), { role: 'alert', texto: erro || '' });
    raiz.appendChild(el('main.entrada', null, el('form.entrada-caixa', {
      onsubmit: function (e) {
        e.preventDefault(); chave = inp.value.trim();
        chamar('prof_estado').then(function (r) { C.guardar(CHAVE, chave); iniciar(r); })
          .catch(function (x) { msg.textContent = x.message; msg.classList.remove('oculto'); });
      }
    }, el('h1', { texto: 'Painel do professor' }), el('p.sub', { texto: 'Use a chave que está na aba Config da planilha.' }), msg,
      el('label.campo', null, el('span', { texto: 'Chave' }), inp), el('button.btn.btn-forte', { type: 'submit', texto: 'Abrir painel' }))));
    inp.focus();
  }

  function chamar(acao, dados) { return C.chamar(acao, Object.assign({ chave: chave }, dados || {})); }

  function iniciar(r) {
    raiz = C.limpar(document.getElementById('app'));
    nos.fase = el('div.fase-nome'); nos.relogio = el('div.relogio');
    nos.acoes = el('div.acoes');
    nos.barra = el('div.prof-barra', null, el('div', null, el('small', { texto: 'Fase atual' }), nos.fase), nos.relogio, nos.acoes);
    nos.tabela = el('div');
    nos.extra = el('div');
    raiz.appendChild(el('main.prof', null, nos.barra, nos.tabela, nos.extra));
    receber(r);
    clearInterval(timer); timer = setInterval(atualizar, 4000);
    setInterval(function () { if (est) C.pintarRelogio(nos.relogio, est.global.prazo); }, 1000);
  }

  function atualizar() { return chamar('prof_estado').then(receber).catch(function (e) { C.toast(e.message, true); }); }

  function receber(r) {
    est = r; C.sincronizar(r.agora);
    var ids = {}; r.grupos.forEach(function (g) { ids[g.caso] = 1; });
    Promise.all(Object.keys(ids).map(function (id) { return C.carregarCaso(id).then(function (c) { casos[id] = c; }); })).then(pintar);
  }

  function acao(nome, dados, msgOk) {
    return chamar(nome, dados).then(function (r) { if (msgOk) C.toast(msgOk); receber(r); }).catch(function (e) { C.toast(e.message, true); });
  }

  function pintar() {
    var g = est.global, f = g.fase, titulos = est.titulosFase;
    nos.fase.textContent = (f > 0 ? f + '. ' : '') + titulos[f];
    C.pintarRelogio(nos.relogio, g.prazo);
    var chaveAcoes = f + '|' + !!g.prazo;
    if (chaveAcoes !== nos.chaveAcoes) { nos.chaveAcoes = chaveAcoes; pintarAcoes(f, g, titulos); }
    pintarTabela();
    var chaveExtra = est.semEntrar.map(function (x) { return x.codigo; }).join(',');
    if (chaveExtra !== nos.chaveExtra) { nos.chaveExtra = chaveExtra; pintarExtra(); }
  }

  function pintarAcoes(f, g, titulos) {
    C.limpar(nos.acoes);
    if (f < 6) {
      var prox = el('button.btn.btn-marca', { type: 'button', texto: 'Abrir: ' + titulos[f + 1] });
      armar(prox, f >= 1 && f <= 4 ? 'Confirmar (envia o que estiver marcado)' : 'Confirmar', function () { return acao('prof_fase', { fase: f + 1 }, 'Fase aberta.'); });
      nos.acoes.appendChild(prox);
    }
    if (g.prazo) {
      nos.acoes.appendChild(el('button.btn', { type: 'button', texto: '+1 min', onclick: function () { acao('prof_tempo', { minutos: 1 }); } }));
      nos.acoes.appendChild(el('button.btn', { type: 'button', texto: '-1 min', onclick: function () { acao('prof_tempo', { minutos: -1 }); } }));
    }
    if (f > 0) {
      var volta = el('button.btn', { type: 'button', texto: 'Voltar fase' });
      armar(volta, 'Confirmar volta', function () { return acao('prof_fase', { fase: f - 1 }); });
      nos.acoes.appendChild(volta);
    }
  }

  function armar(botao, texto, fn) {
    var orig = botao.textContent, armado = false, t;
    botao.addEventListener('click', function () {
      if (!armado) { armado = true; botao.textContent = texto; t = setTimeout(function () { armado = false; botao.textContent = orig; }, 4000); return; }
      clearTimeout(t); armado = false; botao.disabled = true; Promise.resolve(fn()).then(function () { botao.disabled = false; botao.textContent = orig; });
    });
  }

  function minutos(ms) { return (Math.round(ms / 6000) / 10).toString().replace('.', ',') + ' min'; }

  function pintarTabela() {
    var fase = est.global.fase;
    var linhas = est.grupos.map(function (g) {
      var c = casos[g.caso], m = g.modelo, t = g.telemetria;
      var status = ['f1', 'f2', 'f3', 'evento'].map(function (fid, i) {
        var e = g.enviadas[fid], cls = e ? (e.automatico ? 'tempo' : 'enviado') : (g.rascunhos[fid] ? 'rascunho' : '');
        return el('span.chip' + (cls ? '.' + cls : ''), { title: c ? c.fases[i].titulo : fid, texto: (i + 1) + (e ? ' ' + e.pontos : '') });
      });
      var bandeiras = [];
      if (m && m.flags.vazamento.length) bandeiras.push(el('span.bandeira', { texto: 'Vazamento: ' + m.flags.vazamento.join(', ') }));
      if (m && m.flags.sensivel.length) bandeiras.push(el('span.bandeira.violeta', { texto: 'Sensível: ' + m.flags.sensivel.join(', ') }));
      if (m && m.flags.redes) bandeiras.push(el('span.bandeira.violeta', { texto: 'Comprou dados de redes sociais' }));
      if (m && m.flags.ruido.length) bandeiras.push(el('span.bandeira.violeta', { texto: 'Ruído como feature: ' + m.flags.ruido.join(', ') }));
      var suspeito = t.colagens > 0 || t.insercoesGrandes > 0 || t.tempoForaMs > 120000 || t.saidas > 6;
      return el('tr', null,
        el('td', null, el('span.ponto-on' + (g.online ? '.on' : ''), { title: g.online ? 'Conectado' : 'Sem sinal há mais de 25 s' }), el('b', { texto: g.nome }),
          el('div', { style: 'color:var(--grafite);font-size:.8rem', texto: g.casoTitulo }),
          el('div', { style: 'font-size:.8rem', texto: g.membros.join(', ') || 'Sem nomes' })),
        el('td', null, el('div.chips', null, status)),
        el('td.num', null, el('b', { texto: g.total }), el('div', { style: 'font-size:.72rem;color:var(--grafite)', texto: 'desemp. ' + g.pontos.desempenho + ', veloc. ' + g.pontos.velocidade + ', créd. ' + g.bonusCreditos })),
        el('td.num', null, m ? C.fmtAuc(m.aucValidacao) : '', m && fase >= 4 ? el('div', { texto: 'prod. ' + C.fmtAuc(m.aucProducao) }) : null),
        el('td', null, bandeiras.length ? bandeiras : el('span', { style: 'color:var(--grafite)', texto: m ? 'Nenhuma' : '' })),
        el('td' + (suspeito ? '.alerta-tel' : ''), { style: 'font-size:.8rem' },
          el('div', { texto: t.saidas + ' saídas, ' + minutos(t.tempoForaMs) + ' fora' }),
          el('div', { texto: t.colagens + ' colagens (' + t.charsColados + ' caract.)' }),
          el('div', { texto: t.insercoesGrandes + ' inserções grandes' })),
        el('td', null, el('div.acoes-linha', null,
          el('button.btn.btn-pequeno', { type: 'button', texto: 'Ver respostas', onclick: function () { abrirRespostas(g); } }),
          fase >= 5 ? el('button.btn.btn-pequeno', { type: 'button', texto: 'Sortear quem responde', onclick: function () { acao('prof_sortear', { codigo: g.codigo }, 'Sorteio no telão.'); } }) : null,
          fase >= 5 ? el('button.btn.btn-pequeno' + (est.global.projetar === g.codigo ? '.btn-marca' : ''), { type: 'button', texto: est.global.projetar === g.codigo ? 'Ficha no telão' : 'Projetar ficha', onclick: function () { acao('prof_projetar', { codigo: est.global.projetar === g.codigo ? null : g.codigo }); } }) : null)));
    });
    C.limpar(nos.tabela).appendChild(el('table.tabela-prof', null,
      el('thead', null, el('tr', null, ['Grupo', 'Fases', 'Pontos', 'AUC', 'Sinais para o pitch', 'Comportamento', ''].map(function (h) { return el('th', { texto: h }); }))),
      el('tbody', null, linhas.length ? linhas : el('tr', null, el('td', { colspan: 7, texto: 'Nenhum grupo entrou ainda.' })))));
    if (est.global.sorteio) nos.tabela.appendChild(el('div.aviso', { texto: 'Sorteio: ' + est.global.sorteio.membro + ' (' + est.global.sorteio.nome + ') responde.' }));
  }

  function pintarExtra() {
    var x = C.limpar(nos.extra);
    if (est.semEntrar.length) x.appendChild(el('section.secao-prof', null, el('h3', { texto: 'Grupos que ainda não entraram' }),
      el('div.codigos', null, est.semEntrar.map(function (g) { return el('span', null, el('b', { texto: g.nome + ': ' }), el('span.mono', { texto: g.codigo })); }))));
    x.appendChild(el('section.secao-prof', null, el('h3', { texto: 'Ferramentas' }), el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' },
      C.demo ? null : el('a.btn', { href: 'telao.html', target: '_blank', texto: 'Abrir o telão' }),
      el('button.btn', { type: 'button', texto: 'Baixar respostas (CSV)', onclick: exportar }),
      (function () { var b = el('button.btn.btn-perigo', { type: 'button', texto: 'Reiniciar o jogo' }); armar(b, 'Apaga tudo. Confirmar?', function () { return acao('prof_reiniciar', {}, 'Jogo reiniciado.'); }); return b; })(),
      el('button.btn', { type: 'button', texto: 'Sair', onclick: function () { C.guardar(CHAVE, null); clearInterval(timer); nos.chaveAcoes = nos.chaveExtra = null; telaChave(); } }))));
  }

  function abrirRespostas(g) {
    var c = casos[g.caso];
    var corpo = el('div');
    c.fases.forEach(function (f) {
      var env = g.enviadas[f.id], R = env ? env.respostas : (g.rascunhos[f.id] || {});
      var sec = el('section.revela-fase', null, el('h3', { texto: f.titulo + (env ? ': ' + env.pontos + ' pontos' + (env.automatico ? ' (encerrada pelo tempo)' : '') : R && Object.keys(R).length ? ' (rascunho)' : ' (sem respostas)') }));
      f.itens.forEach(function (it) {
        var r = R[it.id], v;
        if (it.tipo === 'escolha') { var o = (it.opcoes || []).filter(function (o) { return o.id === r; })[0]; v = o ? o.texto : 'Sem resposta'; }
        else if (it.tipo === 'texto') v = r || 'Sem resposta';
        else if (it.tipo === 'simulador') v = r && r.pct ? String(r.pct).replace('.', ',') + '% dos clientes' : 'Sem resposta';
        else if (it.tipo === 'mercado') v = g.compras.map(function (id) { var fo = it.fontes.filter(function (x) { return x.id === id; })[0]; return fo ? fo.nome : id; }).join(', ') || 'Nada comprado';
        else if (it.tipo === 'cartas') v = c.caixas.map(function (cx) { return cx.nome + ': ' + (it.cartas.filter(function (k) { return r && r[k.id] === cx.id; }).map(function (k) { return k.nome; }).join(', ') || 'nenhuma'); }).join('\n');
        var pts = env && env.det ? env.det[it.id] : null;
        sec.appendChild(el('div.revela-item', null, pts != null && it.pontosMax ? el('span.pts', { texto: pts + ' / ' + it.pontosMax }) : null,
          el('b', { texto: it.rotulo || it.enunciado }), el('div', { style: 'white-space:pre-line' + (it.tipo === 'texto' ? ';font-style:italic' : ''), texto: v })));
      });
      corpo.appendChild(sec);
    });
    var fundo = el('div.modal-fundo', { onclick: function (e) { if (e.target === fundo) fundo.remove(); } },
      el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Respostas de ' + g.nome },
        el('div.modal-cab', null, el('h2', { style: 'margin:0', texto: g.nome + ', ' + g.casoTitulo }), el('button.btn.btn-pequeno', { type: 'button', texto: 'Fechar', onclick: function () { fundo.remove(); } })),
        corpo));
    document.body.appendChild(fundo);
  }

  function exportar() {
    chamar('prof_exportar').then(function (r) {
      function cel(v) { var s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
      var linhas = [r.colunas].concat(r.linhas).map(function (l) { return l.map(cel).join(';'); }).join('\r\n');
      var blob = new Blob(['﻿' + linhas], { type: 'text/csv;charset=utf-8' });
      var a = el('a', { href: URL.createObjectURL(blob), download: 'desafios-ia-respostas.csv' });
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { C.toast(e.message, true); });
  }

  chave = C.ler(CHAVE);
  if (C.demo && !chave) chave = 'DEMO';
  if (chave) chamar('prof_estado').then(iniciar).catch(function (e) { C.guardar(CHAVE, null); telaChave(e.message); });
  else telaChave();
})();
