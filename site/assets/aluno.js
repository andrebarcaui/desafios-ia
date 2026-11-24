/* Tela do grupo */
(function () {
  var C = Comum, el = C.el;
  var CHAVE = 'desafios.sessao';
  var sessao = null, caso = null, est = null, chaveTela = '', locais = {}, raiz = null;
  var nos = {}, salvarTimer = null, pollTimer = null, selecionada = null;
  var tel = { saidas: 0, tempoForaMs: 0, colagens: 0, charsColados: 0, insercoesGrandes: 0 }, foraDesde = null;

  /* ---------- Entrada ---------- */
  function telaEntrada(erro) {
    raiz = C.limpar(document.getElementById('app'));
    var campos = [0, 1, 2, 3, 4].map(function (i) { return el('input', { type: 'text', placeholder: 'Nome ' + (i + 1), autocomplete: 'off', maxlength: 60 }); });
    var codigo = el('input.codigo-input', { type: 'text', placeholder: 'ABC-123', autocomplete: 'off', maxlength: 20, required: true, 'aria-label': 'Código do grupo' });
    var aceite = el('input', { type: 'checkbox', required: true });
    var msg = el('div.aviso.aviso-erro' + (erro ? '' : '.oculto'), { role: 'alert', texto: erro || '' });
    var form = el('form.entrada-caixa', {
      onsubmit: function (ev) {
        ev.preventDefault();
        var membros = campos.map(function (c) { return c.value.trim(); }).filter(Boolean);
        if (!membros.length) { msg.textContent = 'Escrevam o nome de pelo menos um integrante.'; msg.classList.remove('oculto'); return; }
        botao.disabled = true; botao.textContent = 'Entrando...';
        C.chamar('entrar', { codigo: codigo.value, membros: membros }).then(function (r) {
          sessao = { codigo: r.codigo, nome: r.nome, caso: r.caso };
          C.guardar(CHAVE, sessao);
          return iniciar();
        }).catch(function (e) {
          botao.disabled = false; botao.textContent = 'Entrar no jogo';
          msg.textContent = e.message; msg.classList.remove('oculto');
        });
      }
    },
      el('h1', { texto: 'Desafios de IA' }),
      el('p.sub', { texto: 'Machine learning supervisionado. Cada grupo recebe um caso diferente.' }),
      msg,
      el('label.campo', null, el('span', { texto: 'Código do grupo' }), codigo),
      el('fieldset.campo.membros-lista', { style: 'border:0;padding:0;margin:0 0 1rem' }, el('legend', { style: 'font-weight:700;margin-bottom:.3rem', texto: 'Integrantes do grupo' }), campos),
      el('label', { style: 'display:flex;gap:.6rem;align-items:flex-start;margin-bottom:1.25rem;font-size:.92rem' }, aceite,
        el('span', { texto: 'Nosso grupo vai resolver o caso sem ferramentas de IA generativa. Sabemos que o site registra quando saímos da tela e quando colamos texto, e que no pitch o professor sorteia quem responde.' })),
      el('button.btn.btn-forte', { type: 'submit', texto: 'Entrar no jogo' }));
    var botao = form.querySelector('button');
    raiz.appendChild(el('main.entrada', null, form));
    codigo.focus();
  }

  /* ---------- Jogo ---------- */
  function iniciar() {
    return C.carregarCaso(sessao.caso).then(function (c) {
      caso = c;
      montarEsqueleto();
      instalarProtecao();
      return atualizar();
    }).then(function () {
      clearInterval(pollTimer);
      pollTimer = setInterval(atualizar, 5000);
      setInterval(tique, 1000);
      setInterval(function () { if (temTelemetria()) salvarAgora(); }, 20000);
    });
  }

  function montarEsqueleto() {
    raiz = C.limpar(document.getElementById('app'));
    nos.relogio = el('div.relogio', { 'aria-label': 'Tempo restante da fase' });
    nos.creditos = el('b'); nos.pontos = el('b'); nos.posicao = el('small');
    nos.trilha = el('ol.trilha', null, caso.fases.map(function (f, i) { return el('li', { dados: { fase: f.id } }, el('b', { texto: i + 1 }), f.curto || f.titulo); }));
    var topo = el('header.topo', null,
      el('div.topo-caso', null, el('strong', { texto: caso.titulo }), el('small', { texto: sessao.nome + ', ' + caso.empresa })),
      nos.trilha,
      el('div.topo-status', null,
        el('div.medidor', null, nos.creditos, el('small', { texto: 'créditos' })),
        el('div.medidor', null, nos.pontos, nos.posicao),
        nos.relogio));
    nos.dicas = el('div.dicas-compradas');
    nos.dossieBtn = el('button.dossie-alternar', { type: 'button', texto: 'Recolher dossiê', onclick: alternarDossie });
    var dossie = el('aside.dossie', { 'aria-label': 'Dossiê do caso' }, nos.dossieBtn, el('div.dossie-conteudo', null, renderBriefing(), nos.dicas));
    nos.missao = el('main.missao', { id: 'missao' });
    nos.palco = el('div.palco', null, dossie, nos.missao);
    nos.rodape = el('div.rodape-envio.oculto');
    var textoMarca = sessao.nome + '   ' + sessao.codigo, marcas = [];
    for (var i = 0; i < 90; i++) marcas.push(el('span', { texto: textoMarca }));
    raiz.appendChild(el('div.protegido', null, topo, nos.palco, nos.rodape));
    raiz.appendChild(el('div.marca-dagua', { 'aria-hidden': 'true' }, el('div', null, marcas)));
  }

  function alternarDossie() {
    var fechado = nos.palco.classList.toggle('dossie-fechado');
    nos.dossieBtn.textContent = fechado ? 'Abrir dossiê' : 'Recolher dossiê';
  }

  function renderBriefing() {
    var b = caso.briefing;
    return el('div', null,
      el('h2', { texto: 'Dossiê' }),
      el('article.email', null,
        el('div.email-cab', null, el('div', null, 'De: ', el('b', { texto: b.remetente }), ', ' + b.cargo), el('div', null, 'Assunto: ', el('b', { texto: b.assunto }))),
        b.mensagem.map(function (p) { return el('p', { texto: p }); })),
      b.contexto.map(function (c) { return el('div.ficha-contexto', null, el('b', { texto: c.titulo }), c.texto); }));
  }

  function atualizar() {
    return C.chamar('estado', { codigo: sessao.codigo }).then(function (r) {
      est = r; C.sincronizar(r.agora);
      pintarTopo(); pintarDicas();
      var fid = r.faseId, env = r.grupo.enviadas[fid];
      if (!locais[fid] && r.grupo.rascunhos[fid]) locais[fid] = JSON.parse(JSON.stringify(r.grupo.rascunhos[fid]));
      var chave = [r.fase, env ? 'e' : 'a', r.sorteio ? r.sorteio.ts : '', r.ficha ? 'f' : '', r.revelacao ? 'r' : ''].join('|');
      if (chave !== chaveTela) { chaveTela = chave; renderTela(); }
    }).catch(function (e) {
      if (/Entre no jogo|não encontrado/.test(e.message)) { C.guardar(CHAVE, null); clearInterval(pollTimer); telaEntrada(e.message); }
      else C.toast('Sem conexão com o servidor. Tentando de novo...', true);
    });
  }

  function tique() { if (est) C.pintarRelogio(nos.relogio, est.prazo); }

  function pintarTopo() {
    var g = est.grupo;
    nos.creditos.textContent = g.creditos;
    nos.pontos.textContent = g.total + ' pts';
    nos.posicao.textContent = g.posicao ? g.posicao + 'º de ' + g.totalGrupos : '';
    var idx = est.fase;
    Array.prototype.forEach.call(nos.trilha.children, function (li, i) {
      li.classList.toggle('atual', i + 1 === idx);
      li.classList.toggle('feita', !!g.enviadas[li.dataset.fase]);
    });
    tique();
  }

  function pintarDicas() {
    var d = est.grupo.dicas;
    C.limpar(nos.dicas);
    if (!d.length) return;
    nos.dicas.appendChild(el('h3', { texto: 'Dicas compradas' }));
    d.forEach(function (x) { nos.dicas.appendChild(el('div.dica', null, el('b', { texto: x.titulo }), el('div', { texto: x.texto }))); });
  }

  /* ---------- Telas por fase ---------- */
  function renderTela() {
    var m = C.limpar(nos.missao);
    nos.rodape.classList.add('oculto'); nos.labFn = null; nos.rodapeFn = null;
    window.scrollTo(0, 0);
    var fase = est.fase >= 1 && est.fase <= 4 ? caso.fases[est.fase - 1] : null;
    var larga = !!(fase && fase.itens.some(function (i) { return i.tipo === 'cartas'; }));
    m.classList.toggle('missao-larga', larga);
    if (larga && !est.grupo.enviadas[fase.id] && !nos.recolhidoAuto) { nos.recolhidoAuto = true; if (!nos.palco.classList.contains('dossie-fechado')) alternarDossie(); }
    if (est.fase === 0) return renderEspera(m);
    if (est.fase >= 1 && est.fase <= 4) return renderFase(m, caso.fases[est.fase - 1]);
    if (est.fase === 5) return renderPitch(m);
    if (est.fase === 6) return renderRevelacao(m);
  }

  function renderEspera(m) {
    m.appendChild(el('div.missao-cab', null,
      el('h1', { texto: 'Bem-vindos, ' + sessao.nome }),
      el('p.missao-texto', { texto: 'O professor ainda não abriu a primeira fase. Aproveitem para ler o dossiê ao lado: os detalhes fazem diferença.' })));
    m.appendChild(el('section.item', null, el('h2', { texto: 'Como funciona' }), el('ul', null,
      el('li', { texto: 'São quatro fases com tempo fixo. O relógio no topo mostra quanto falta.' }),
      el('li', { texto: 'Uma fase enviada não pode mais ser alterada. Se o tempo acabar, o que estiver marcado é enviado automaticamente.' }),
      el('li', { texto: 'Vocês têm ' + caso.creditosIniciais + ' créditos para comprar dados e dicas. Créditos que sobrarem viram pontos no final.' }),
      el('li', { texto: 'Enviar com pelo menos 2 minutos de folga vale pontos extras.' }),
      el('li', { texto: 'No pitch, o professor sorteia quem do grupo responde à pergunta dele.' }))));
  }

  function respostasDaFase(fid) {
    if (est.grupo.enviadas[fid]) return est.grupo.enviadas[fid].respostas || {};
    if (!locais[fid]) locais[fid] = {};
    return locais[fid];
  }

  function renderFase(m, fase) {
    var env = est.grupo.enviadas[fase.id], R = respostasDaFase(fase.id), travado = !!env;
    var cab = el('div.missao-cab', null, el('h1', { texto: fase.titulo }), el('p.missao-texto', { texto: fase.missao }));
    m.appendChild(cab);
    if (env) m.appendChild(el('div.selado', { role: 'status' },
      el('b', { texto: env.automatico ? 'Fase encerrada pelo tempo: ' + env.pontos + ' pontos.' : 'Fase enviada: ' + env.pontos + ' pontos' + (env.rapido ? ', mais 2 pela folga no relógio.' : '.') }),
      el('div', { texto: 'Aguardem o professor abrir a próxima fase.' })));
    if (fase.id === 'evento' && est.evento) m.appendChild(renderAlertaProducao(est.evento));
    if (!travado && fase.dicas && fase.dicas.length) cab.appendChild(renderDicasFase(fase));
    var corpo = el('div' + (travado ? '.travado' : ''));
    fase.itens.forEach(function (it) { corpo.appendChild(renderItem(it, R, travado, fase)); });
    m.appendChild(corpo);
    if (!travado) montarRodape(fase, R);
  }

  function renderDicasFase(fase) {
    var compradas = est.grupo.dicas.map(function (d) { return d.id; });
    return el('div.dicas-fase', null, fase.dicas.map(function (d) {
      var ja = compradas.indexOf(d.id) >= 0;
      var b = el('button.btn.btn-pequeno', { type: 'button', disabled: ja, texto: ja ? d.titulo + ' (no dossiê)' : d.titulo + ', ' + d.custo + ' créditos' });
      if (!ja) confirmarDuplo(b, 'Confirmar: gastar ' + d.custo + ' créditos', function () {
        return C.chamar('dica', { codigo: sessao.codigo, dicaId: d.id }).then(function (r) {
          est.grupo.creditos = r.creditos; est.grupo.dicas.push({ id: r.dica.id, titulo: r.dica.titulo, texto: r.dica.texto });
          pintarTopo(); pintarDicas();
          if (nos.palco.classList.contains('dossie-fechado')) alternarDossie();
          b.disabled = true; b.textContent = d.titulo + ' (no dossiê)';
          C.toast('Dica adicionada ao dossiê.');
        });
      });
      return b;
    }));
  }

  /* Botão que pede um segundo clique para confirmar */
  function confirmarDuplo(botao, textoConfirma, acao) {
    var original = botao.textContent, armado = false, t = null;
    botao.addEventListener('click', function () {
      if (!armado) {
        armado = true; botao.textContent = textoConfirma; botao.classList.add('btn-confirmar');
        t = setTimeout(function () { armado = false; botao.textContent = original; botao.classList.remove('btn-confirmar'); }, 4000);
        return;
      }
      clearTimeout(t); armado = false; botao.disabled = true; botao.classList.remove('btn-confirmar');
      Promise.resolve(acao()).catch(function (e) { C.toast(e.message, true); botao.disabled = false; botao.textContent = original; });
    });
  }

  function renderItem(it, R, travado, fase) {
    var bloco = el('section.item', { dados: { item: it.id } });
    bloco.appendChild(el('div.item-enunciado', { texto: it.enunciado }));
    if (it.tipo === 'escolha') bloco.appendChild(renderEscolha(it, R, travado));
    else if (it.tipo === 'texto') bloco.appendChild(renderTexto(it, R, travado));
    else if (it.tipo === 'cartas') { nos.mesa = el('div.mesa'); bloco.appendChild(nos.mesa); pintarMesa(it, R, travado); }
    else if (it.tipo === 'mercado') { nos.mercado = el('div'); bloco.appendChild(nos.mercado); pintarMercado(it, travado); }
    else if (it.tipo === 'simulador') { nos.lab = el('div.lab'); bloco.appendChild(nos.lab); nos.labFn = function () { pintarLab(it, R, travado, fase); }; nos.labFn(); }
    return bloco;
  }

  function renderEscolha(it, R, travado) {
    var box = el('div.opcoes', { role: 'radiogroup' });
    it.opcoes.forEach(function (o) {
      var inp = el('input', { type: 'radio', name: it.id, value: o.id, disabled: travado, checked: R[it.id] === o.id });
      var lab = el('label.opcao' + (R[it.id] === o.id ? '.marcada' : ''), null, inp, el('span', { texto: o.texto }));
      inp.addEventListener('change', function () {
        R[it.id] = o.id;
        Array.prototype.forEach.call(box.children, function (l) { l.classList.toggle('marcada', l.querySelector('input').checked); });
        mudou();
        if (nos.labFn && est.grupo.modelo) nos.labFn();
      });
      box.appendChild(lab);
    });
    return box;
  }

  function renderTexto(it, R, travado) {
    var max = it.maxChars || 400;
    var ta = el('textarea', { maxlength: max, rows: 3, disabled: travado, 'aria-label': it.enunciado });
    ta.value = R[it.id] || '';
    var cont = el('div.contador', { texto: ta.value.length + ' de ' + max });
    var anterior = ta.value.length;
    ta.addEventListener('paste', function (e) {
      tel.colagens++;
      try { tel.charsColados += ((e.clipboardData || window.clipboardData).getData('text') || '').length; } catch (x) {}
    });
    ta.addEventListener('input', function (e) {
      var delta = ta.value.length - anterior;
      if (delta > 60 && e.inputType !== 'insertFromPaste') tel.insercoesGrandes++;
      anterior = ta.value.length;
      R[it.id] = ta.value; cont.textContent = ta.value.length + ' de ' + max; mudou();
    });
    return el('div', null, ta, cont);
  }

  /* Cartas */
  function ordemCartas(it) {
    return it.cartas.slice().sort(function (a, b) { return hash(caso.id + a.id) - hash(caso.id + b.id); });
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
  }

  function pintarMesa(it, R, travado) {
    var mapa = R[it.id] || (R[it.id] = {});
    var mesa = C.limpar(nos.mesa), cartas = ordemCartas(it);
    var soltas = cartas.filter(function (c) { return !mapa[c.id]; });
    function mover(id, caixa) {
      if (travado) return;
      if (caixa) mapa[id] = caixa; else delete mapa[id];
      selecionada = null; pintarMesa(it, R, travado); mudou();
    }
    function carta(c) {
      var no = el('div.carta' + (selecionada === c.id ? '.selecionada' : ''), { draggable: !travado, tabindex: travado ? null : 0, role: 'button', 'aria-label': 'Coluna ' + c.nome, dados: { carta: c.id } },
        el('div.carta-nome', { texto: c.nome }), el('div.carta-desc', { texto: c.descricao }),
        el('div.carta-ex', null, c.exemplos.map(function (x) { return el('span', { texto: x }); })));
      if (!travado) {
        no.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; no.classList.add('arrastando'); });
        no.addEventListener('dragend', function () { no.classList.remove('arrastando'); });
        var sel = function (e) { e.stopPropagation(); selecionada = selecionada === c.id ? null : c.id; pintarMesa(it, R, travado); };
        no.addEventListener('click', sel);
        no.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(e); } });
      }
      return no;
    }
    function alvo(no, caixa) {
      if (travado) return;
      no.addEventListener('dragover', function (e) { e.preventDefault(); no.classList.add('alvo'); });
      no.addEventListener('dragleave', function () { no.classList.remove('alvo'); });
      no.addEventListener('drop', function (e) { e.preventDefault(); no.classList.remove('alvo'); var id = e.dataTransfer.getData('text/plain'); if (id) mover(id, caixa); });
      no.addEventListener('click', function () { if (selecionada) mover(selecionada, caixa); });
    }
    var monte = el('div.monte', { 'aria-label': 'Colunas ainda sem caixa' }, soltas.length ? soltas.map(carta) : el('span.monte-vazio', { texto: 'Todas as 16 colunas estão classificadas. Cliquem numa coluna para mudá-la de caixa.' }));
    alvo(monte, null);
    var caixas = el('div.caixas', null, caso.caixas.map(function (cx) {
      var dentro = cartas.filter(function (c) { return mapa[c.id] === cx.id; });
      var corpo = el('div.caixa-corpo', null, dentro.map(carta));
      var no = el('div.caixa', { dados: { caixa: cx.id } },
        el('div.caixa-cab', null, el('b', { texto: cx.nome + ' (' + dentro.length + ')' }), el('small', { texto: cx.ajuda })), corpo,
        selecionada && !travado ? el('button.caixa-botao', { type: 'button', texto: 'Colocar aqui' }) : null);
      alvo(no, cx.id);
      return no;
    }));
    mesa.appendChild(el('div.mesa-lado', null,
      el('div.contador', { style: 'text-align:left', texto: (cartas.length - soltas.length) + ' de ' + cartas.length + ' colunas classificadas' }),
      monte));
    mesa.appendChild(caixas);
  }

  /* Mercado de dados */
  function pintarMercado(it, travado) {
    var box = C.limpar(nos.mercado), compras = est.grupo.compras;
    box.appendChild(el('div.fontes', null, it.fontes.map(function (f) {
      var comprada = compras.indexOf(f.id) >= 0;
      var acao;
      if (comprada) acao = el('span.selo', { texto: 'Comprada' });
      else if (travado) acao = el('span', { texto: '' });
      else {
        acao = el('button.btn.btn-pequeno', { type: 'button', texto: 'Comprar', disabled: est.grupo.creditos < f.custo });
        confirmarDuplo(acao, 'Confirmar compra', function () {
          return C.chamar('comprar', { codigo: sessao.codigo, fonteId: f.id }).then(function (r) {
            est.grupo.creditos = r.creditos; est.grupo.compras = r.compras; pintarTopo(); pintarMercado(it, travado);
            C.toast(f.nome + ': compra feita.');
          });
        });
      }
      return el('div.fonte' + (comprada ? '.comprada' : ''), null, el('b', { texto: f.nome }), el('p', { texto: f.descricao }),
        el('div.fonte-rodape', null, el('span.preco', { texto: f.custo + ' créditos' }), acao));
    })));
  }

  /* Laboratório de treino */
  function pintarLab(it, R, travado, fase) {
    var lab = C.limpar(nos.lab), m = est.grupo.modelo, sim = caso.simulador;
    var div = itemDivisao(fase);
    var desatualizado = m && div && R[div.id] && m.divisao !== R[div.id];
    var treinar = el('button.btn.btn-forte', { type: 'button', texto: m ? 'Treinar de novo' : 'Treinar modelo', disabled: travado });
    treinar.addEventListener('click', function () {
      if (div && !R[div.id]) { C.toast('Escolham primeiro como separar os dados.', true); return; }
      treinar.disabled = true; treinar.textContent = 'Treinando...';
      C.chamar('treinar', { codigo: sessao.codigo, respostas: R }).then(function (r) {
        est.grupo.modelo = r.modelo; pintarLab(it, R, travado, fase); atualizarRodape();
      }).catch(function (e) { C.toast(e.message, true); treinar.disabled = false; treinar.textContent = 'Treinar modelo'; });
    });
    if (!m) {
      lab.appendChild(el('p', { texto: 'O modelo é treinado com as colunas que vocês classificaram como feature, os dados externos comprados e a divisão escolhida acima.' }));
      if (!travado) lab.appendChild(treinar);
      return;
    }
    var bonus = Math.max(0, Math.min(15, Math.round((m.aucValidacao - 0.5) * 30)));
    lab.appendChild(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap' },
      el('h3', { style: 'margin:0', texto: 'Resultado do treino (' + m.nFeatures + ' features)' }), travado ? null : treinar));
    if (desatualizado) lab.appendChild(el('div.aviso', { texto: 'Vocês mudaram a divisão dos dados depois do treino. Treinem de novo antes de enviar.' }));
    lab.appendChild(el('div.lab-placar', null,
      el('div.lab-num', null, el('b', { texto: C.fmtAuc(m.aucValidacao) }), el('small', { texto: 'AUC no conjunto de teste' })),
      el('div.lab-num', null, el('b', { texto: C.fmtPct(m.acuracia) }), el('small', { texto: 'acurácia do modelo' })),
      el('div.lab-num', null, el('b', { texto: C.fmtPct(m.acuraciaIngenua) }), el('small', { texto: 'acurácia de quem responde "ninguém sai", sem modelo nenhum' }))));
    lab.appendChild(el('p', { style: 'font-size:.9rem;color:var(--grafite)', texto: 'Este resultado vale um bônus provisório de ' + bonus + ' pontos no placar (máximo de 15).' }));
    var val = R[it.id] && R[it.id].pct ? Number(R[it.id].pct) : null;
    var leitura = el('b'), detalhe = el('div');
    var regua = el('input', { type: 'range', min: sim.minPct, max: sim.maxPct, step: 0.5, value: val || sim.minPct, disabled: travado, 'aria-label': 'Percentual de clientes a ' + sim.rotuloAcao });
    function pintar() {
      var pct = Number(regua.value), s = Stats.simular(m.aucValidacao, sim, pct);
      leitura.textContent = String(pct).replace('.', ',') + '%';
      C.limpar(detalhe).appendChild(el('div', null,
        el('div.matriz', null,
          el('div.mh'), el('div.mh', { texto: 'Fugiu de verdade' }), el('div.mh', { texto: 'Não fugiu' }),
          el('div.mh', { texto: 'Abordado' }), el('div.acerto', null, el('b', { texto: C.fmtInt(s.vp) }), 'verdadeiros positivos'), el('div.erro', null, el('b', { texto: C.fmtInt(s.fp) }), 'falsos positivos'),
          el('div.mh', { texto: 'Não abordado' }), el('div.erro', null, el('b', { texto: C.fmtInt(s.fn) }), 'falsos negativos'), el('div.acerto', null, el('b', { texto: C.fmtInt(s.vn) }), 'verdadeiros negativos')),
        el('div.contas', null,
          el('div', null, el('b', { texto: C.fmtPct(s.precisao) }), el('small', { texto: 'precisão: dos abordados, quantos iam fugir' })),
          el('div', null, el('b', { texto: C.fmtPct(s.recall) }), el('small', { texto: 'recall: dos que iam fugir, quantos foram abordados' })),
          el('div', null, el('b', { texto: C.fmtReais(s.custo) }), el('small', { texto: 'custo da campanha por mês' })),
          el('div', null, el('b', { texto: C.fmtReais(s.receitaSalva) }), el('small', { texto: 'margem anual dos clientes salvos' })),
          el('div.destaque', null, el('b', { texto: C.fmtReais(s.valor) }), el('small', { texto: 'valor esperado por mês' })))));
    }
    regua.addEventListener('input', function () { R[it.id] = { pct: Number(regua.value) }; pintar(); mudou(); });
    lab.appendChild(el('div.regua', null,
      el('div.regua-leitura', null, el('span', { texto: 'Clientes a ' + sim.rotuloAcao + ', por mês, do maior para o menor risco' }), leitura), regua));
    var dicaRegua = !val && !travado ? el('div.contador', { style: 'text-align:left', texto: 'Movam a régua para escolher o percentual.' }) : null;
    if (dicaRegua) { lab.appendChild(dicaRegua); regua.addEventListener('input', function () { dicaRegua.remove(); }, { once: true }); }
    lab.appendChild(detalhe);
    pintar();
  }
  function itemDivisao(fase) {
    var sim = fase.itens.filter(function (i) { return i.tipo === 'simulador'; })[0];
    if (!sim || !sim.divisaoItem) return null;
    return fase.itens.filter(function (i) { return i.id === sim.divisaoItem; })[0] || null;
  }

  function renderAlertaProducao(ev) {
    return el('section.alerta-producao', { role: 'alert' },
      el('h2', { texto: ev.titulo }),
      el('div.queda', null, el('span.de', { texto: 'AUC ' + C.fmtAuc(ev.aucValidacao) }), el('span.para', { texto: C.fmtAuc(ev.aucProducao) })),
      el('p', { texto: ev.mensagem }),
      ev.campanha ? el('p', null, 'A campanha abordando ' + String(ev.campanha.pct).replace('.', ',') + '% dos clientes prometia ', el('b', { texto: C.fmtReais(ev.campanha.prometido) }), ' por mês. Em produção, entregou ', el('b', { texto: C.fmtReais(ev.campanha.real) }), '. Os pontos da campanha no placar agora valem pelo resultado real.') : null,
      el('h3', { texto: 'O que o monitoramento mostra' }),
      el('ul.evidencias', null, ev.evidencias.map(function (e) { return el('li', { texto: e }); })));
  }

  /* Rodapé de envio */
  function pendencias(fase, R) {
    var n = 0;
    fase.itens.forEach(function (it) {
      if (it.tipo === 'escolha' && !R[it.id]) n++;
      if (it.tipo === 'texto' && !(R[it.id] || '').trim()) n++;
      if (it.tipo === 'cartas') { var mp = R[it.id] || {}; n += it.cartas.filter(function (c) { return !mp[c.id]; }).length ? 1 : 0; }
      if (it.tipo === 'simulador' && !(est.grupo.modelo && R[it.id] && R[it.id].pct)) n++;
    });
    return n;
  }
  function atualizarRodape() { if (nos.rodapeFn) nos.rodapeFn(); }
  function montarRodape(fase, R) {
    var rod = C.limpar(nos.rodape); rod.classList.remove('oculto');
    var info = el('span.pendencias'), botao = el('button.btn.btn-marca', { type: 'button', texto: 'Enviar fase' });
    rod.appendChild(info); rod.appendChild(botao);
    nos.rodapeFn = function () {
      var p = pendencias(fase, R), m = est.grupo.modelo, div = itemDivisao(fase);
      var bloqueio = fase.itens.some(function (it) { return it.tipo === 'simulador'; }) && m && div && R[div.id] && m.divisao !== R[div.id];
      info.textContent = bloqueio ? 'Treinem o modelo de novo com a divisão escolhida.' : p ? p + ' item(ns) sem resposta' : 'Tudo respondido';
      botao.disabled = !!bloqueio;
    };
    nos.rodapeFn();
    confirmarDuplo(botao, 'Confirmar envio (não dá para desfazer)', function () {
      clearTimeout(salvarTimer);
      return C.chamar('enviar', { codigo: sessao.codigo, faseId: fase.id, respostas: R, telemetria: tomarTelemetria() }).then(function (r) {
        C.toast('Fase enviada: ' + r.pontos + ' pontos' + (r.rapido ? ' e mais 2 pela folga.' : '.'));
        chaveTela = ''; return atualizar();
      });
    });
  }

  /* Revelação e pitch */
  function renderPitch(m) {
    if (est.sorteio) m.appendChild(el('div.sorteio-faixa', { role: 'status' }, 'Sorteado para responder ao professor:', el('b', { texto: est.sorteio.membro })));
    m.appendChild(el('div.missao-cab', null, el('h1', { texto: 'Pitch ao comitê' }),
      el('p.missao-texto', { texto: 'Esta é a Ficha do Modelo de vocês, montada a partir das escolhas do grupo. Apresentem em 2 minutos: o problema, o dataset, o resultado e o que aprenderam em produção.' })));
    if (est.ficha) m.appendChild(C.renderFicha(est.ficha));
  }

  function renderRevelacao(m) {
    var r = est.revelacao; if (!r) return;
    var a = r.armadilha;
    m.appendChild(el('section.revela-armadilha', null, el('small', { texto: 'A armadilha principal deste caso' }), el('h2', { texto: a.armadilha }),
      el('p', { texto: a.resumo }), el('p', null, el('b', { texto: 'Armadilha secundária: ' }), a.secundaria),
      el('ul', null, a.licoes.map(function (l) { return el('li', { texto: l }); }))));
    r.fases.forEach(function (f) {
      var sec = el('section.revela-fase', null, el('h2', { texto: f.titulo + ': ' + f.pontos + ' pontos' }));
      f.itens.forEach(function (it) {
        var box = el('div.revela-item');
        if (it.max) box.appendChild(el('span.pts', { texto: it.pontos + ' / ' + it.max }));
        box.appendChild(el('b', { texto: it.enunciado }));
        if (it.tipo === 'escolha' || it.tipo === 'simulador') {
          box.appendChild(el('div.sua', { texto: 'Vocês: ' + (it.sua || 'Sem resposta') }));
          if (it.correta) box.appendChild(el('div.certa', { texto: 'Melhor resposta: ' + it.correta }));
          if (it.explicacao) box.appendChild(el('p', { style: 'margin:.4rem 0 0', texto: it.explicacao }));
        } else if (it.tipo === 'texto') box.appendChild(el('div.sua', { texto: it.sua || 'Sem resposta' }));
        else if (it.tipo === 'cartas') box.appendChild(el('table.revela-cartas', null,
          el('thead', null, el('tr', null, el('th', { texto: 'Coluna' }), el('th', { texto: 'Vocês' }), el('th', { texto: 'Correto' }), el('th', { texto: 'Por quê' }))),
          el('tbody', null, it.cartas.map(function (c) { return el('tr.' + (c.ok ? 'ok' : 'nok'), null, el('td.mono', { texto: c.nome }), el('td', { texto: c.sua }), el('td', { texto: c.correta }), el('td', { texto: c.explicacao })); }))));
        else if (it.tipo === 'mercado') box.appendChild(el('ul', null, it.fontes.map(function (fo) {
          return el('li', null, el('b', { texto: fo.nome + (fo.comprou ? ' (comprada, ' + (fo.pontos >= 0 ? '+' : '') + fo.pontos + ' pts)' : ' (não comprada)') + ': ' }), fo.explicacao);
        })));
        sec.appendChild(box);
      });
      m.appendChild(sec);
    });
  }

  /* ---------- Salvamento e telemetria ---------- */
  function mudou() { atualizarRodape(); clearTimeout(salvarTimer); salvarTimer = setTimeout(salvarAgora, 1500); }
  function salvarAgora() {
    if (!est) return;
    var fid = est.faseId, R = (fid && !est.grupo.enviadas[fid]) ? locais[fid] : null;
    C.chamar('salvar', { codigo: sessao.codigo, faseId: R ? fid : null, respostas: R, telemetria: tomarTelemetria() }).catch(function () {});
  }
  function temTelemetria() { return tel.saidas || tel.tempoForaMs || tel.colagens || tel.insercoesGrandes; }
  function tomarTelemetria() {
    if (foraDesde) { tel.tempoForaMs += Date.now() - foraDesde; foraDesde = Date.now(); }
    var t = tel; tel = { saidas: 0, tempoForaMs: 0, colagens: 0, charsColados: 0, insercoesGrandes: 0 }; return t;
  }
  function saiu() { if (!foraDesde) { foraDesde = Date.now(); tel.saidas++; } }
  function voltou() { if (foraDesde) { tel.tempoForaMs += Date.now() - foraDesde; foraDesde = null; } }

  function instalarProtecao() {
    window.addEventListener('blur', saiu);
    window.addEventListener('focus', voltou);
    document.addEventListener('visibilitychange', function () { if (document.hidden) saiu(); else voltou(); });
    function campo(t) { return t && t.closest && t.closest('textarea, input'); }
    ['copy', 'cut'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { if (!campo(e.target)) { e.preventDefault(); C.toast('Copiar o conteúdo do caso está desativado.'); } });
    });
    document.addEventListener('contextmenu', function (e) { if (!campo(e.target)) e.preventDefault(); });
    document.addEventListener('selectstart', function (e) { if (!campo(e.target)) e.preventDefault(); });
  }

  /* ---------- Início ---------- */
  sessao = C.ler(CHAVE);
  if (sessao && sessao.codigo) iniciar().catch(function (e) { C.guardar(CHAVE, null); telaEntrada(e.message); });
  else telaEntrada();
})();
