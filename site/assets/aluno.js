/* Tela do grupo */
(function () {
  var C = Comum, el = C.el;
  /* Na visão do professor (professor/grupo.html), a mesma tela abre em modo só leitura. */
  var ESPIAR = !!window.DESAFIOS_ESPIAR, chaveProf = null;
  var CHAVE = 'desafios.sessao' + (window.name && window.name.indexOf('espiar') !== 0 ? '.' + window.name : '');
  var sessao = null, caso = null, est = null, chaveTela = '', locais = {}, raiz = null;
  var nos = {}, salvarTimer = null, pollTimer = null, selecionada = null;
  var tel = { saidas: 0, tempoForaMs: 0, colagens: 0, charsColados: 0, insercoesGrandes: 0 }, foraDesde = null;

  /* ---------- Entrada ---------- */
  function telaEntrada(erro) {
    raiz = C.limpar(document.getElementById('app'));
    var campos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return el('input', { type: 'text', placeholder: 'Nome ' + (i + 1), autocomplete: 'off', maxlength: 60 }); });
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
      el('p.sub', { texto: 'Machine learning na prática. Cada grupo recebe um caso diferente.' }),
      msg,
      el('label.campo', null, el('span', { texto: 'Código do grupo' }), codigo),
      el('fieldset.campo.membros-lista', { style: 'border:0;padding:0;margin:0 0 1rem' }, el('legend', { style: 'font-weight:700;margin-bottom:.3rem', texto: 'Integrantes do grupo (até 10)' }), el('div.membros-grade', null, campos)),
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
      if (!ESPIAR) instalarProtecao();
      return atualizar();
    }).then(function () {
      clearInterval(pollTimer);
      pollTimer = setInterval(atualizar, 5000);
      setInterval(tique, 1000);
      if (!ESPIAR) setInterval(function () { if (temTelemetria()) salvarAgora(); }, 20000);
    });
  }

  function montarEsqueleto() {
    raiz = C.limpar(document.getElementById('app'));
    nos.relogio = el('div.relogio', { 'aria-label': 'Tempo restante da fase' });
    nos.creditos = el('b'); nos.pontos = el('b'); nos.posicao = el('small');
    nos.trilha = el('ol.trilha', null, caso.fases.map(function (f, i) { return el('li', { dados: { fase: f.id } }, el('b', { texto: i + 1 }), f.curto || f.titulo); }));
    var topo = el('header.topo', null,
      el('div.topo-caso', null, el('strong', { texto: caso.titulo }), el('small', { texto: (ESPIAR ? 'Visão do professor: ' : '') + sessao.nome + ', ' + caso.empresa })),
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
    var textoMarca = ESPIAR ? 'Visão do professor' : sessao.nome + '   ' + sessao.codigo, marcas = [];
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
    var img = C.urlImagem(caso);
    return el('div', null,
      img ? el('img.dossie-img', { src: img, alt: '' }) : null,
      el('h2', { texto: 'Dossiê' }),
      el('article.email', null,
        el('div.email-cab', null, el('div', null, 'De: ', el('b', { texto: b.remetente }), ', ' + b.cargo), el('div', null, 'Assunto: ', el('b', { texto: b.assunto }))),
        b.mensagem.map(function (p) { return el('p', { texto: p }); })),
      b.contexto.map(function (c) { return el('div.ficha-contexto', null, el('b', { texto: c.titulo }), c.texto); }));
  }

  function atualizar() {
    var pedido = ESPIAR ? C.chamar('prof_grupo', { chave: chaveProf, codigo: sessao.codigo }) : C.chamar('estado', { codigo: sessao.codigo });
    return pedido.then(function (r) {
      est = r; C.sincronizar(r.agora);
      pintarTopo(); pintarDicas();
      var fid = r.faseId, env = r.grupo.enviadas[fid];
      if (!ESPIAR && !locais[fid] && r.grupo.rascunhos[fid]) locais[fid] = JSON.parse(JSON.stringify(r.grupo.rascunhos[fid]));
      var chave = [r.fase, env ? 'e' : 'a', r.sorteio ? r.sorteio.ts : '', r.ficha ? 'f' : '', r.revelacao ? 'r' : ''].join('|');
      if (ESPIAR) chave += JSON.stringify([r.grupo.rascunhos[fid], r.grupo.compras, r.grupo.modelo]);
      if (chave !== chaveTela) { chaveTela = chave; renderTela(); }
    }).catch(function (e) {
      if (ESPIAR) C.toast(e.message, true);
      else if (/Entre no jogo|não encontrado/.test(e.message)) { C.guardar(CHAVE, null); clearInterval(pollTimer); telaEntrada(e.message); }
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
    var img = C.urlImagem(caso);
    if (img) m.appendChild(el('img.capa-caso', { src: img, alt: 'Ilustração do caso ' + caso.titulo }));
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
    if (ESPIAR) return JSON.parse(JSON.stringify(est.grupo.rascunhos[fid] || {}));
    if (!locais[fid]) locais[fid] = {};
    return locais[fid];
  }

  function renderFase(m, fase) {
    var env = est.grupo.enviadas[fase.id], R = respostasDaFase(fase.id), travado = ESPIAR || !!env;
    var cab = el('div.missao-cab', null, el('h1', { texto: fase.titulo }), el('p.missao-texto', { texto: fase.missao }));
    m.appendChild(cab);
    if (env) m.appendChild(el('div.selado', { role: 'status' },
      el('b', { texto: env.automatico ? 'Fase encerrada pelo tempo: ' + env.pontos + ' pontos.' : 'Fase enviada: ' + env.pontos + ' pontos' + (env.rapido ? ', mais 2 pela folga no relógio.' : '.') }),
      el('div', { texto: 'Aguardem o professor abrir a próxima fase.' })));
    if (ESPIAR && !env) m.appendChild(el('div.selado', { style: 'border-left-color:var(--marca)' }, el('b', { texto: 'Visão do professor' }), el('div', { texto: 'Rascunho atual do grupo, atualizado a cada 5 segundos. Nada aqui pode ser alterado.' })));
    if (fase.id === 'evento' && est.evento) m.appendChild(renderAlertaProducao(est.evento));
    if (!travado && fase.dicas && fase.dicas.length) cab.appendChild(renderDicasFase(fase));
    if (fase.explicacao) m.appendChild(el('section.passos', null, el('h2', { texto: fase.explicacao.titulo }),
      el('ol', null, fase.explicacao.passos.map(function (p) { return el('li', null, el('b', { texto: p.titulo }), el('span', { texto: p.texto })); }))));
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
    if (it.entenda) bloco.appendChild(el('details.entenda', { open: !travado }, el('summary', { texto: 'Entenda antes de responder' }), el('p', { texto: it.entenda })));
    if (it.tipo === 'escolha') bloco.appendChild(renderEscolha(it, R, travado));
    else if (it.tipo === 'texto') bloco.appendChild(renderTexto(it, R, travado));
    else if (it.tipo === 'cartas') { nos.mesa = el('div.mesa'); bloco.appendChild(nos.mesa); pintarMesa(it, R, travado); }
    else if (it.tipo === 'mercado') { nos.mercado = el('div'); bloco.appendChild(nos.mercado); pintarMercado(it, travado); }
    else if (it.tipo === 'simulador') { nos.lab = el('div.lab'); bloco.appendChild(nos.lab); nos.labFn = function () { pintarLab(it, R, travado, fase); }; nos.labFn(); }
    else if (it.tipo === 'agrupamento') { nos.lab = el('div.lab'); bloco.appendChild(nos.lab); nos.labFn = function () { pintarAgrupamento(it, R, travado, fase); }; nos.labFn(); }
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
  /* Arrastar com eventos de ponteiro: funciona em Chrome, Safari, Firefox, Edge e telas de toque. */
  var arraste = { suprimir: false };
  function iniciarArraste(e, no, soltarEm) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var x0 = e.clientX, y0 = e.clientY, px = x0, py = y0, ativo = false, fantasma = null, alvoAtual = null, quadro = null;
    var r = no.getBoundingClientRect(), dx = x0 - r.left, dy = y0 - r.top;
    function posicionar() { fantasma.style.transform = 'translate(' + (px - dx) + 'px,' + (py - dy) + 'px) rotate(1.5deg)'; }
    function rolar() {
      if (!ativo) return;
      var v = py < 110 ? -14 : (py > window.innerHeight - 90 ? 14 : 0);
      if (v) { window.scrollBy(0, v); procurarAlvo(); }
      quadro = requestAnimationFrame(rolar);
    }
    function procurarAlvo() {
      var sob = document.elementFromPoint(px, py), a = sob && sob.closest('.caixa, .monte');
      if (a !== alvoAtual) { if (alvoAtual) alvoAtual.classList.remove('alvo'); alvoAtual = a; if (a) a.classList.add('alvo'); }
    }
    function mexer(ev) {
      px = ev.clientX; py = ev.clientY;
      if (!ativo) {
        if (Math.abs(px - x0) + Math.abs(py - y0) < 6) return;
        ativo = true;
        fantasma = no.cloneNode(true);
        fantasma.classList.add('fantasma'); fantasma.classList.remove('selecionada');
        fantasma.style.width = r.width + 'px';
        document.body.appendChild(fantasma);
        no.classList.add('arrastando');
        document.body.classList.add('arrastando-carta');
        rolar();
      }
      ev.preventDefault();
      posicionar(); procurarAlvo();
    }
    function soltar() {
      document.removeEventListener('pointermove', mexer);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      if (!ativo) return;
      ativo = false; cancelAnimationFrame(quadro);
      fantasma.remove(); no.classList.remove('arrastando'); document.body.classList.remove('arrastando-carta');
      if (alvoAtual) alvoAtual.classList.remove('alvo');
      arraste.suprimir = true; setTimeout(function () { arraste.suprimir = false; }, 80);
      if (alvoAtual) soltarEm(alvoAtual);
    }
    document.addEventListener('pointermove', mexer, { passive: false });
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
  }

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
      var no = el('div.carta' + (selecionada === c.id ? '.selecionada' : ''), { tabindex: travado ? null : 0, role: 'button', 'aria-label': 'Coluna ' + c.nome, dados: { carta: c.id } },
        el('div.carta-nome', { texto: c.nome }), el('div.carta-desc', { texto: c.descricao }),
        el('div.carta-ex', null, c.exemplos.map(function (x) { return el('span', { texto: x }); })));
      if (!travado) {
        no.classList.add('movel');
        var sel = function (e) { e.stopPropagation(); selecionada = selecionada === c.id ? null : c.id; pintarMesa(it, R, travado); };
        no.addEventListener('click', function (e) { if (arraste.suprimir) { arraste.suprimir = false; e.stopPropagation(); return; } sel(e); });
        no.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(e); } });
        no.addEventListener('pointerdown', function (e) { iniciarArraste(e, no, function (alvoNo) { mover(c.id, alvoNo.dataset.caixa || null); }); });
      }
      return no;
    }
    function alvo(no) {
      if (travado) return;
      no.addEventListener('click', function () { if (selecionada) mover(selecionada, no.dataset.caixa || null); });
    }
    var monte = el('div.monte', { 'aria-label': 'Colunas ainda sem caixa' }, soltas.length ? soltas.map(carta) : el('span.monte-vazio', { texto: 'Todas as 16 colunas estão classificadas. Para mudar uma de caixa, arrastem a coluna ou cliquem nela e depois na caixa nova.' }));
    alvo(monte);
    var caixas = el('div.caixas', null, caso.caixas.map(function (cx) {
      var dentro = cartas.filter(function (c) { return mapa[c.id] === cx.id; });
      var corpo = el('div.caixa-corpo', null, dentro.map(carta));
      var no = el('div.caixa', { dados: { caixa: cx.id } },
        el('div.caixa-cab', null, el('b', { texto: cx.nome + ' (' + dentro.length + ')' }), el('small', { texto: cx.ajuda })), corpo,
        selecionada && !travado ? el('button.caixa-botao', { type: 'button', texto: 'Colocar aqui' }) : null);
      alvo(no);
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

  /* ---------- Laboratórios ---------- */
  function itemBase(fase) {
    var lab = fase.itens.filter(function (i) { return i.tipo === 'simulador' || i.tipo === 'agrupamento'; })[0];
    if (!lab || !lab.dependeDe) return null;
    return fase.itens.filter(function (i) { return i.id === lab.dependeDe; })[0] || null;
  }
  function botaoRodar(R, travado, texto, textoRodando, base, msgFalta) {
    var b = el('button.btn.btn-forte', { type: 'button', texto: texto, disabled: travado });
    b.addEventListener('click', function () {
      if (base && !R[base.id]) { C.toast(msgFalta, true); return; }
      b.disabled = true; b.textContent = textoRodando;
      C.chamar('treinar', { codigo: sessao.codigo, respostas: R }).then(function (r) {
        est.grupo.modelo = r.modelo; if (nos.labFn) nos.labFn(); atualizarRodape();
      }).catch(function (e) { C.toast(e.message, true); b.disabled = false; b.textContent = texto; });
    });
    return b;
  }
  function pct(x, casas) { return C.fmtPct(x, casas == null ? 1 : casas); }
  function cabLab(titulo, botao) {
    return el('div.lab-cab', null, el('h3', { texto: titulo }), botao);
  }
  /* Régua com faixas de leitura (ex.: fraco, bom, muito bom) e um marcador no valor */
  function escala(valor, min, max, faixas) {
    function x(v) { return Math.max(0, Math.min(100, (v - min) / (max - min) * 100)); }
    var trilho = el('div.escala-trilho', null, faixas.map(function (f, i) {
      var fim = i + 1 < faixas.length ? faixas[i + 1][0] : max;
      return el('div.escala-faixa', { style: 'left:' + x(f[0]) + '%;width:' + (x(fim) - x(f[0])) + '%' }, el('span', { texto: f[1] }));
    }), el('div.escala-marca', { style: 'left:' + x(valor) + '%' }, el('b', { texto: C.fmtAuc(valor) })));
    return el('div.escala', { 'aria-hidden': 'true' }, trilho,
      el('div.escala-pontas', null, el('span', { texto: C.fmtAuc(min) }), el('span', { texto: C.fmtAuc(max) })));
  }

  /* Supervisionado: treino, leitura da AUC e decisão da campanha */
  function pintarLab(it, R, travado, fase) {
    var lab = C.limpar(nos.lab), m = est.grupo.modelo, sim = caso.simulador, t = sim.termos;
    var base = itemBase(fase), desatualizado = m && base && R[base.id] && m.base !== R[base.id];
    var treinar = botaoRodar(R, travado, m ? 'Treinar de novo' : 'Treinar o modelo', 'Treinando...', base, 'Escolham primeiro como separar os dados.');
    if (!m) {
      lab.appendChild(el('p', { texto: 'O modelo vai aprender com as colunas que vocês colocaram em "Usar como feature" e com os dados externos comprados, separando treino e teste do jeito escolhido acima. O resultado aparece aqui, com a explicação de cada número.' }));
      if (!travado) lab.appendChild(treinar);
      return;
    }
    lab.appendChild(cabLab('Resultado do treino, com ' + m.nFeatures + ' features', travado ? null : treinar));
    if (desatualizado) lab.appendChild(el('div.aviso', { texto: 'Vocês mudaram a divisão dos dados depois do treino. Treinem de novo antes de enviar.' }));
    var auc = m.aucValidacao, p100 = Math.round(auc * 100);
    lab.appendChild(el('div.lab-bloco', null,
      el('div.lab-num', null, el('b', { texto: C.fmtAuc(auc) }), el('small', { texto: 'AUC no conjunto de teste' })),
      el('div', null,
        escala(auc, 0.5, 1, [[0.5, 'fraco'], [0.6, 'razoável'], [0.7, 'bom'], [0.85, 'muito bom'], [0.92, 'excepcional']]),
        el('p', { texto: 'Como ler: sorteando um ' + t.um + ' que ' + t.passado + ' e um que ' + t.passadoNeg + ', em ' + p100 + ' de cada 100 sorteios o modelo dá nota de risco maior ' + t.aoPositivo + '. AUC 0,5 é o mesmo que tirar cara ou coroa; 1,0 é acertar sempre.' }))));
    lab.appendChild(el('div.lab-bloco', null,
      el('div.lab-num', null, el('b', { texto: pct(m.acuracia) }), el('small', { texto: 'acurácia do modelo' })),
      el('p', { texto: 'O modelo acerta ' + pct(m.acuracia) + ' dos ' + t.unidade + '. Parece ótimo, mas compare: quem simplesmente dissesse que ' + t.ninguem + ' acertaria ' + pct(m.acuraciaIngenua) + ', sem modelo nenhum, porque só ' + pct(sim.prevalencia, sim.prevalencia < 0.02 ? 1 : 0) + ' ' + t.verboPlural + '. Quando um dos lados é raro, a acurácia engana.' })));
    var bonus = Math.max(0, Math.min(15, Math.round((auc - 0.5) * 30)));
    lab.appendChild(el('p.lab-nota', { texto: 'Este resultado vale um bônus provisório de ' + bonus + ' pontos no placar (máximo de 15).' }));

    lab.appendChild(el('h3', { style: 'margin-top:1.5rem', texto: t.tituloDecisao }));
    lab.appendChild(el('p', { texto: 'O modelo coloca os ' + C.fmtInt(sim.baseClientes) + ' ' + t.unidade + ' do mês numa fila, ' + t.ordem + '. A régua decide até onde da fila a ' + t.campanha + ' vai. Quanto mais à direita, mais ' + t.positivosCurto + ' a ' + t.campanha + ' encontra, e mais dinheiro gasta com ' + t.negativosCurto + '.' }));
    var val = R[it.id] && R[it.id].pct ? Number(R[it.id].pct) : null;
    var leitura = el('b'), detalhe = el('div');
    var regua = el('input', { type: 'range', min: sim.minPct, max: sim.maxPct, step: 0.5, value: val || sim.minPct, disabled: travado, 'aria-label': 'Percentual da fila que a campanha alcança' });
    function pintar() {
      var p = Number(regua.value), s = Stats.simular(auc, sim, p), alcancados = s.vp + s.fp;
      leitura.textContent = String(p).replace('.', ',') + '% da fila';
      C.limpar(detalhe).appendChild(el('div', null,
        el('p.narrativa', null, 'Indo até ' + String(p).replace('.', ',') + '% da fila, a ' + t.campanha + ' ' + t.verboAlcanca + ' ', el('b', { texto: C.fmtInt(alcancados) + ' ' + t.unidade }), ' por mês. Destes, ',
          el('b', { texto: C.fmtInt(s.vp) }), ' ' + t.positivos + ' e ', el('b', { texto: C.fmtInt(s.fp) }), ' ' + t.negativos + '. Outros ', el('b', { texto: C.fmtInt(s.fn) }), ' que ' + t.positivos + ' ficaram de fora.'),
        el('div.matriz', null,
          el('div.mh'), el('div.mh', { texto: 'Na realidade, ' + t.positivos }), el('div.mh', { texto: 'Na realidade, ' + t.negativos }),
          el('div.mh', { texto: t.acaoTitulo }),
          el('div.acerto', null, el('b', { texto: C.fmtInt(s.vp) }), t.vp, el('small', { texto: 'verdadeiro positivo' })),
          el('div.erro', null, el('b', { texto: C.fmtInt(s.fp) }), t.fp, el('small', { texto: 'falso positivo' })),
          el('div.mh', { texto: t.naoAcaoTitulo }),
          el('div.erro', null, el('b', { texto: C.fmtInt(s.fn) }), t.fn, el('small', { texto: 'falso negativo' })),
          el('div.acerto', null, el('b', { texto: C.fmtInt(s.vn) }), t.vn, el('small', { texto: 'verdadeiro negativo' }))),
        el('div.contas', null,
          el('div', null, el('b', { texto: pct(s.precisao, 0) }), el('span', { texto: 'Precisão' }), el('small', { texto: 'De cada 100 ' + t.acao + ', ' + Math.round(s.precisao * 100) + ' ' + t.positivos + '.' })),
          el('div', null, el('b', { texto: pct(s.recall, 0) }), el('span', { texto: 'Recall' }), el('small', { texto: 'De cada 100 que ' + t.positivos + ', a ' + t.campanha + ' ' + t.verboAlcanca + ' ' + Math.round(s.recall * 100) + '.' })),
          el('div', null, el('b', { texto: C.fmtReais(s.custo) }), el('span', { texto: 'Custo por mês' }), el('small', { texto: C.fmtInt(alcancados) + ' ' + t.acao + ' × ' + C.fmtReais(sim.custoAcao) + ', acertando ou não.' })),
          el('div', null, el('b', { texto: C.fmtReais(s.receitaSalva) }), el('span', { texto: t.ganho }), el('small', { texto: Math.round(sim.taxaSalvamento * 100) + '% dos ' + C.fmtInt(s.vp) + ' acertos ' + t.efeito + ': ' + C.fmtInt(s.salvos) + ' × ' + C.fmtReais(sim.valorCliente) + '.' })),
          el('div.destaque', null, el('b', { texto: C.fmtReais(s.valor) }), el('span', { texto: 'Valor esperado por mês' }), el('small', { texto: t.ganho + ' menos o custo.' })))));
    }
    regua.addEventListener('input', function () { R[it.id] = { pct: Number(regua.value) }; pintar(); mudou(); });
    lab.appendChild(el('div.regua', null, el('div.regua-leitura', null, el('span', { texto: 'Até onde da fila a campanha vai' }), leitura), regua,
      el('div.regua-pontas', null, el('span', { texto: t.pontaEsq }), el('span', { texto: t.pontaDir }))));
    var dicaRegua = !val && !travado ? el('div.contador', { style: 'text-align:left', texto: 'Movam a régua para escolher.' }) : null;
    if (dicaRegua) { lab.appendChild(dicaRegua); regua.addEventListener('input', function () { dicaRegua.remove(); }, { once: true }); }
    lab.appendChild(detalhe);
    pintar();
  }

  /* Agrupamento: silhueta por número de grupos e perfil de cada grupo */
  function pintarAgrupamento(it, R, travado, fase) {
    var lab = C.limpar(nos.lab), m = est.grupo.modelo, ag = caso.agrupamento;
    var base = itemBase(fase), desatualizado = m && base && R[base.id] && m.base !== R[base.id];
    var rodar = botaoRodar(R, travado, m ? 'Rodar de novo' : 'Rodar o agrupamento', 'Agrupando...', base, 'Escolham primeiro como preparar as variáveis.');
    if (!m) {
      lab.appendChild(el('p', { texto: 'O algoritmo vai usar as colunas que vocês colocaram em "Usar para agrupar" e os dados externos comprados, preparados do jeito escolhido acima. Ele vai dividir os ' + C.fmtInt(ag.total) + ' ' + ag.itens + ' em ' + ag.kMin + ', ' + (ag.kMin + 1) + ', até ' + ag.kMax + ' grupos, e mostrar cada resultado.' }));
      if (!travado) lab.appendChild(rodar);
      return;
    }
    lab.appendChild(cabLab('Resultado do agrupamento, com ' + m.nFeatures + ' variáveis', travado ? null : rodar));
    if (desatualizado) lab.appendChild(el('div.aviso', { texto: 'Vocês mudaram a preparação das variáveis depois de rodar. Rodem de novo antes de enviar.' }));
    var atual = R[it.id] && R[it.id].k ? Number(R[it.id].k) : null;
    var barras = el('div.barras-k'), perfis = el('div'), leitura = el('b'), nota = el('p.lab-nota');
    var regua = el('input', { type: 'range', min: ag.kMin, max: ag.kMax, step: 1, value: atual || ag.kMin, disabled: travado, 'aria-label': 'Número de grupos' });
    function pintar() {
      var k = Number(regua.value), sil = m.silhuetas[k];
      leitura.textContent = k + ' grupos';
      C.limpar(barras);
      for (var i = ag.kMin; i <= ag.kMax; i++) {
        var v = m.silhuetas[i];
        barras.appendChild(el('div.barra-k' + (i === k ? '.atual' : ''), null, el('span', { texto: i + ' grupos' }),
          el('div.barra-k-trilho', null, el('i', { style: 'width:' + Math.max(2, v * 100) + '%' })), el('b', { texto: C.fmtAuc(v) })));
      }
      C.limpar(perfis).appendChild(el('div.perfis', null, (m.perfis[k] || []).map(function (p) {
        return el('article.perfil', null, el('b', { texto: p.nome }),
          el('div.perfil-n', null, el('i', { style: 'width:' + (p.n / ag.total * 100) + '%' }), el('span', { texto: C.fmtInt(p.n) + ' ' + ag.itens + ' (' + Math.round(p.n / ag.total * 100) + '%)' })),
          el('ul', null, p.tracos.map(function (x) { return el('li', { texto: x }); })),
          el('div.perfil-comp', null, ag.rotuloComparacao + ': ', el('b', { texto: p.desvio })));
      })));
      nota.textContent = 'Com ' + k + ' grupos, a silhueta é ' + C.fmtAuc(sil) + '. Este resultado vale um bônus provisório de ' + Math.min(15, Math.round(sil * 25)) + ' pontos no placar (máximo de 15).';
    }
    lab.appendChild(el('div.lab-bloco.lab-bloco-largo', null,
      el('div', null, el('h4', { texto: 'Silhueta para cada número de grupos' }), barras),
      el('div', null,
        escala(m.silhuetas[atual || ag.kMin], 0, 1, [[0, 'fraca'], [0.25, 'razoável'], [0.5, 'boa'], [0.7, 'muito forte']]),
        el('p', { texto: 'Como ler: a silhueta vai de -1 a 1. Perto de 1, cada ' + ag.item + ' está muito mais perto dos ' + ag.itens + ' do próprio grupo do que dos outros grupos. Perto de 0, os grupos se misturam. A silhueta mede separação, não utilidade: quem diz se um grupo serve é o negócio.' }))));
    lab.appendChild(el('h3', { style: 'margin-top:1.5rem', texto: 'Em quantos grupos dividir' }));
    lab.appendChild(el('div.regua', null, el('div.regua-leitura', null, el('span', { texto: 'Número de grupos (k)' }), leitura), regua));
    lab.appendChild(nota);
    lab.appendChild(el('p', { style: 'font-size:.9rem;color:var(--grafite)', texto: 'Os nomes dos grupos foram sugeridos pelo analista a partir das características mais marcantes de cada um. A última linha de cada cartão serve para comparar os grupos.' }));
    lab.appendChild(perfis);
    regua.addEventListener('input', function () {
      R[it.id] = { k: Number(regua.value) }; pintar(); mudou();
      var e = lab.querySelector('.escala'); if (e) e.replaceWith(escala(m.silhuetas[Number(regua.value)], 0, 1, [[0, 'fraca'], [0.25, 'razoável'], [0.5, 'boa'], [0.7, 'muito forte']]));
    });
    if (!atual && !travado) lab.appendChild(el('div.contador', { style: 'text-align:left', texto: 'Movam a régua para escolher o número de grupos.' }));
    pintar();
  }

  function renderAlertaProducao(ev) {
    return el('section.alerta-producao', { role: 'alert' },
      el('h2', { texto: ev.titulo }),
      el('div.queda', null,
        el('div.de', null, el('small', { texto: ev.antes.rotulo }), el('span', { texto: ev.antes.valor })),
        el('div.para', null, el('small', { texto: ev.depois.rotulo }), el('span', { texto: ev.depois.valor }))),
      el('p', { texto: ev.mensagem }),
      ev.campanha ? el('p', null, 'A campanha prometia ', el('b', { texto: C.fmtReais(ev.campanha.prometido) }), ' por mês. Em produção, entregou ', el('b', { texto: C.fmtReais(ev.campanha.real) }), '. Os pontos da campanha no placar agora valem pelo resultado real.') : null,
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
      if (it.tipo === 'agrupamento' && !(est.grupo.modelo && R[it.id] && R[it.id].k)) n++;
    });
    return n;
  }
  function atualizarRodape() { if (nos.rodapeFn) nos.rodapeFn(); }
  function montarRodape(fase, R) {
    var rod = C.limpar(nos.rodape); rod.classList.remove('oculto');
    var info = el('span.pendencias'), botao = el('button.btn.btn-marca', { type: 'button', texto: 'Enviar fase' });
    rod.appendChild(info); rod.appendChild(botao);
    nos.rodapeFn = function () {
      var p = pendencias(fase, R), m = est.grupo.modelo, base = itemBase(fase);
      var bloqueio = base && m && R[base.id] && m.base !== R[base.id];
      info.textContent = bloqueio ? (m.tipo === 'agrupamento' ? 'Rodem o agrupamento de novo com a preparação escolhida.' : 'Treinem o modelo de novo com a divisão escolhida.') : p ? p + ' item(ns) sem resposta' : 'Tudo respondido';
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
        if (it.tipo === 'escolha' || it.tipo === 'simulador' || it.tipo === 'agrupamento') {
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
  function mudou() { if (ESPIAR) return; atualizarRodape(); clearTimeout(salvarTimer); salvarTimer = setTimeout(salvarAgora, 1500); }
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
  if (ESPIAR) {
    var codigoEspiado = decodeURIComponent(location.hash.slice(1)) || (window.name.indexOf('espiar:') === 0 ? window.name.slice(7) : '');
    C.areaProfessor('Tela do grupo', function (s) {
      chaveProf = s;
      C.chamar('prof_grupo', { chave: s, codigo: codigoEspiado }).then(function (r) {
        sessao = { codigo: r.grupo.codigo, nome: r.grupo.nome, caso: r.grupo.caso };
        document.title = r.grupo.nome + ': tela do grupo';
        return iniciar();
      }).catch(function (e) {
        C.limpar(document.getElementById('app')).appendChild(el('main.entrada', null, el('div.entrada-caixa', null, el('h1', { texto: 'Tela do grupo' }), el('div.aviso.aviso-erro', { texto: e.message }))));
      });
    });
    return;
  }
  sessao = C.ler(CHAVE);
  if (sessao && sessao.codigo) iniciar().catch(function (e) { C.guardar(CHAVE, null); telaEntrada(e.message); });
  else telaEntrada();
})();
