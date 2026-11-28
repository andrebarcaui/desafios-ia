/* Painel do professor */
(function () {
  var C = Comum, el = C.el;
  var chave = null, est = null, raiz = null, nos = {}, casos = {}, timer = null;

  function chamar(acao, dados) { return C.chamar(acao, Object.assign({ chave: chave }, dados || {})); }

  /* Duas vistas na mesma aba: o painel (só para o professor) e o telão (para projetar) */
  function verTelao() {
    clearInterval(timer); timer = null;
    nos.painel.classList.add('oculto'); nos.telao.classList.remove('oculto');
    Telao.abrir(nos.telaoConteudo, chave);
  }
  function verPainel() {
    Telao.fechar();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    nos.telao.classList.add('oculto'); nos.painel.classList.remove('oculto');
    atualizar(); clearInterval(timer); timer = setInterval(atualizar, 4000);
  }
  function telaCheia() {
    try { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(function () {}); } catch (e) {}
  }

  function iniciar(r) {
    raiz = C.limpar(document.getElementById('app'));
    nos.fase = el('div.fase-nome'); nos.relogio = el('div.relogio');
    nos.acoes = el('div.acoes');
    nos.barra = el('div.prof-barra', null, el('div', null, el('small', { texto: 'Fase atual' }), nos.fase), nos.relogio, nos.acoes);
    nos.tabela = el('div');
    nos.extra = el('div');
    nos.painel = el('main.prof', null,
      el('div.prof-vistas', null, el('b', { texto: 'Painel do professor' }),
        el('button.btn.btn-forte', { type: 'button', texto: 'Mostrar o telão para a turma', onclick: verTelao })),
      nos.barra, nos.tabela, nos.extra);
    nos.telaoConteudo = el('div');
    nos.telao = el('div.oculto', null, nos.telaoConteudo,
      el('div.telao-controles', null,
        el('button.btn.btn-pequeno', { type: 'button', texto: 'Tela cheia', onclick: telaCheia }),
        el('button.btn.btn-pequeno', { type: 'button', texto: 'Voltar ao painel', onclick: verPainel })));
    raiz.appendChild(nos.painel); raiz.appendChild(nos.telao);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !nos.telao.classList.contains('oculto') && !document.fullscreenElement) verPainel(); });
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
      if (m && m.flags.circular && m.flags.circular.length) bandeiras.push(el('span.bandeira', { texto: 'Agrupou com resultado ou rótulo: ' + m.flags.circular.join(', ') }));
      if (m && m.tipo === 'agrupamento' && m.cenario === 'escala') bandeiras.push(el('span.bandeira', { texto: 'Agrupou sem padronizar as variáveis' }));
      if (m && m.flags.redes) bandeiras.push(el('span.bandeira.violeta', { texto: 'Comprou dados de redes sociais' }));
      if (m && m.flags.ruido.length) bandeiras.push(el('span.bandeira.violeta', { texto: 'Usou coluna sem informação: ' + m.flags.ruido.join(', ') }));
      var suspeito = t.colagens > 0 || t.insercoesGrandes > 0 || t.tempoForaMs > 120000 || t.saidas > 6;
      return el('tr', null,
        el('td', null, el('span.ponto-on' + (g.online ? '.on' : ''), { title: g.online ? 'Conectado' : 'Sem sinal há mais de 25 s' }), el('b', { texto: g.nome }), ' ', el('span.mono', { style: 'font-size:.78rem', texto: g.codigo }),
          el('div', { style: 'color:var(--grafite);font-size:.8rem', texto: g.casoTitulo }),
          el('div', { style: 'font-size:.8rem', texto: g.membros.join(', ') || 'Sem nomes' })),
        el('td', null, el('div.chips', null, status)),
        el('td.pontos', null, el('b', { texto: g.total }),
          el('span', { texto: 'Desempenho ' + g.pontos.desempenho }), el('span', { texto: 'Velocidade ' + g.pontos.velocidade }), el('span', { texto: 'Créditos ' + g.bonusCreditos })),
        el('td.metrica', null, g.resumo && g.resumo.curtoTreino ? el('div', { texto: 'Treino: ' + g.resumo.curtoTreino }) : el('span.vazio', { texto: 'Ainda sem modelo' }),
          g.resumo && g.resumo.curtoProducao ? el('div', { texto: 'Produção: ' + g.resumo.curtoProducao }) : null),
        el('td', null, bandeiras.length ? bandeiras : el('span', { style: 'color:var(--grafite)', texto: m ? 'Nenhuma' : '' })),
        el('td' + (suspeito ? '.alerta-tel' : ''), { style: 'font-size:.8rem' },
          el('div', { texto: t.saidas + ' saídas, ' + minutos(t.tempoForaMs) + ' fora' }),
          el('div', { texto: t.colagens + ' colagens (' + t.charsColados + ' caract.)' }),
          el('div', { texto: t.insercoesGrandes + ' inserções grandes' })),
        el('td', null, el('div.acoes-linha', null,
          el('button.btn.btn-pequeno', { type: 'button', texto: 'Ver respostas', onclick: function () { abrirRespostas(g); } }),
          el('button.btn.btn-pequeno', { type: 'button', texto: 'Roteiro do pitch', onclick: function () { abrirRoteiro(g); } }),
          C.demo ? el('button.btn.btn-pequeno', { type: 'button', texto: 'Ver tela do grupo', onclick: function () { C.pai.DEMO_ESPIAR(g.codigo, g.nome); } })
            : el('a.btn.btn-pequeno', { href: 'grupo.html#' + encodeURIComponent(g.codigo), target: '_blank', rel: 'noopener', texto: 'Ver tela do grupo' }),
          fase >= 5 ? el('button.btn.btn-pequeno', { type: 'button', texto: 'Sortear quem responde', onclick: function () { acao('prof_sortear', { codigo: g.codigo }, 'Sorteio no telão.'); } }) : null,
          fase >= 5 ? el('button.btn.btn-pequeno' + (est.global.projetar === g.codigo ? '.btn-marca' : ''), { type: 'button', texto: est.global.projetar === g.codigo ? 'Ficha no telão' : 'Projetar ficha', onclick: function () { acao('prof_projetar', { codigo: est.global.projetar === g.codigo ? null : g.codigo }); } }) : null)));
    });
    var colunas = [['Grupo', 'c-grupo'], ['Fases', 'c-fases'], ['Pontos', 'c-pontos'], ['Métrica', 'c-metrica'], ['Sinais para o pitch', 'c-sinais'], ['Comportamento', 'c-comp'], ['Ações', 'c-acoes']];
    C.limpar(nos.tabela).appendChild(el('table.tabela-prof', null,
      el('colgroup', null, colunas.map(function (c) { return el('col.' + c[1]); })),
      el('thead', null, el('tr', null, colunas.map(function (c) { return el('th.' + c[1], { texto: c[0] }); }))),
      el('tbody', null, linhas.length ? linhas : el('tr', null, el('td', { colspan: 7, texto: 'Nenhum grupo entrou ainda.' })))));
    nos.tabela.insertBefore(el('p', { style: 'color:var(--grafite);font-size:.85rem;margin:0 0 .6rem', texto: 'Cada grupo só enxerga o próprio caso. Daqui você vê todos: respostas, tela de cada grupo e o telão.' }), nos.tabela.firstChild);
    if (est.global.sorteio) nos.tabela.appendChild(el('div.aviso', { texto: 'Sorteio: ' + est.global.sorteio.membro + ' (' + est.global.sorteio.nome + ') responde.' }));
  }

  function pintarExtra() {
    var x = C.limpar(nos.extra);
    if (est.semEntrar.length) x.appendChild(el('section.secao-prof', null, el('h3', { texto: 'Grupos que ainda não entraram' }),
      el('div.codigos', null, est.semEntrar.map(function (g) { return el('span', null, el('b', { texto: g.nome + ': ' }), el('span.mono', { texto: g.codigo })); }))));
    x.appendChild(el('section.secao-prof', null, el('h3', { texto: 'Ferramentas' }), el('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' },
      el('button.btn', { type: 'button', texto: 'Baixar respostas (CSV)', onclick: exportar }),
      (function () { var b = el('button.btn.btn-perigo', { type: 'button', texto: 'Reiniciar o jogo' }); armar(b, 'Apaga tudo. Confirmar?', function () { return acao('prof_reiniciar', {}, 'Jogo reiniciado.'); }); return b; })(),
      el('button.btn', { type: 'button', texto: 'Sair', onclick: function () { clearInterval(timer); C.sairProfessor(); } }))));
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
        else if (it.tipo === 'simulador') v = r && r.pct ? String(r.pct).replace('.', ',') + '% da fila' : 'Sem resposta';
        else if (it.tipo === 'agrupamento') v = r && r.k ? r.k + ' grupos' : 'Sem resposta';
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


  /* Roteiro do pitch: o que um pitch bom diria, cruzado com as escolhas do grupo.
     As marcações (o que o grupo já citou) ficam só neste navegador. */
  var CHAVE_MARCAS = 'desafios.roteiro';
  var marcas = (function () { try { return JSON.parse(localStorage.getItem(CHAVE_MARCAS)) || {}; } catch (e) { return {}; } })();
  function guardarMarcas() { try { localStorage.setItem(CHAVE_MARCAS, JSON.stringify(marcas)); } catch (e) {} }
  var NOMES_SITUACAO = { ok: 'Acertou', parcial: 'Em parte', erro: 'Errou', vazio: 'Sem resposta' };

  function abrirRoteiro(g) {
    var corpo = el('div', null, el('p', { style: 'color:var(--grafite)', texto: 'Montando o roteiro...' }));
    var fundo = el('div.modal-fundo', { onclick: function (e) { if (e.target === fundo) fundo.remove(); } },
      el('div.modal.modal-largo', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Roteiro do pitch de ' + g.nome },
        el('div.modal-cab', null, el('div', null, el('small', { style: 'color:var(--grafite)', texto: 'Roteiro do pitch' }), el('h2', { style: 'margin:0', texto: g.nome + ', ' + g.casoTitulo })),
          el('div', { style: 'display:flex;gap:.4rem' },
            el('button.btn.btn-pequeno', { type: 'button', texto: 'Atualizar', onclick: carregar }),
            el('button.btn.btn-pequeno', { type: 'button', texto: 'Imprimir', onclick: function () { window.print(); } }),
            el('button.btn.btn-pequeno', { type: 'button', texto: 'Fechar', onclick: function () { fundo.remove(); } }))),
        corpo));
    document.body.appendChild(fundo);
    function carregar() { chamar('prof_roteiro', { codigo: g.codigo }).then(function (r) { pintarRoteiro(C.limpar(corpo), r, g.codigo); }).catch(function (e) { C.toast(e.message, true); }); }
    carregar();
  }

  function pintarRoteiro(corpo, r, codigo) {
    var mk = marcas[codigo] = marcas[codigo] || {};
    corpo.appendChild(el('div.roteiro-central', null, el('b', { texto: 'A mensagem que o pitch precisa passar' }), el('p', { texto: r.central })));

    if (r.perguntas.length) corpo.appendChild(el('section.roteiro-perguntas', null,
      el('h3', { texto: 'Perguntas para quem for sorteado' }),
      el('p.roteiro-nota', { texto: 'Em ordem de prioridade: primeiro o que mais custou pontos ao grupo.' }),
      el('ol', null, r.perguntas.map(function (p) {
        return el('li', null, el('div', { texto: p.texto }), el('div.roteiro-esperado', null, el('b', { texto: 'Resposta esperada: ' }), p.esperado));
      }))));

    r.partes.forEach(function (pt, i) {
      var contador = el('span.roteiro-contador');
      function contar() {
        var n = pt.ideal.filter(function (_, j) { return mk[pt.id + ':' + j]; }).length;
        contador.textContent = n + ' de ' + pt.ideal.length + ' citados';
      }
      var lista = el('ul.roteiro-ideal', null, pt.ideal.map(function (linha, j) {
        var id = 'rt-' + codigo + '-' + pt.id + '-' + j, chave = pt.id + ':' + j;
        var cx = el('input', { type: 'checkbox', id: id });
        cx.checked = !!mk[chave];
        cx.addEventListener('change', function () { mk[chave] = cx.checked; guardarMarcas(); contar(); });
        return el('li', null, cx, el('label', { for: id, texto: linha }));
      }));
      contar();
      var grupo = el('ul.roteiro-grupo', null, pt.pontos.length ? pt.pontos.map(function (p) {
        var li = el('li', null, el('span.situacao.' + p.situacao, { texto: NOMES_SITUACAO[p.situacao] }), el('b', { texto: p.rotulo + ': ' }), p.sua);
        if (p.situacao !== 'ok' && p.correta) li.appendChild(el('div.roteiro-melhor', { texto: 'Melhor: ' + p.correta }));
        if (p.erradas && p.erradas.length) li.appendChild(el('table.roteiro-cartas', null,
          el('thead', null, el('tr', null, el('th', { texto: 'Coluna' }), el('th', { texto: 'O grupo pôs em' }), el('th', { texto: 'Deveria ir para' }))),
          el('tbody', null, p.erradas.map(function (c) {
            return el('tr' + (c.grave ? '.grave' : ''), { title: c.porque || '' }, el('td.mono', { texto: c.nome }), el('td', { texto: c.sua }), el('td', { texto: c.correta }));
          }))));
        if (p.porque && p.situacao !== 'ok') li.appendChild(el('details', null, el('summary', { texto: 'Por quê' }), el('p', { texto: p.porque })));
        return li;
      }) : el('li.roteiro-nota', { texto: 'Nada marcado nesta fase ainda.' }));
      corpo.appendChild(el('section.roteiro-parte', null,
        el('div.roteiro-parte-cab', null, el('h3', { texto: (i + 1) + '. ' + pt.titulo }),
          el('span.roteiro-nota', { texto: pt.fase + (pt.enviada ? ', enviada' : ', em rascunho') })),
        el('div.roteiro-colunas', null,
          el('div', null, el('div.roteiro-subtitulo', null, el('b', { texto: 'O pitch deveria dizer' }), contador), lista),
          el('div', null, el('div.roteiro-subtitulo', null, el('b', { texto: 'O que o grupo marcou' })), grupo))));
    });

    if (r.licoes && r.licoes.length) corpo.appendChild(el('section.roteiro-parte', null, el('h3', { texto: 'Lições que fecham o caso' }),
      el('ul', null, r.licoes.map(function (l) { return el('li', { texto: l }); }))));
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

  C.areaProfessor('Painel do professor', function (s) { chave = s; chamar('prof_estado').then(iniciar).catch(function (e) { C.toast(e.message, true); }); });
})();
