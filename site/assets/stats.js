/* Estatística do simulador. Usado no navegador e no Apps Script. */
var Stats = (function () {
  function erf(x) {
    // Abramowitz & Stegun 7.1.26 com refinamento suficiente para o simulador
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function cdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  function inv(p) {
    // Acklam
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var pl = 0.02425, q, r;
    if (p <= 0) return -8; if (p >= 1) return 8;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }

  /* Modelo binormal: scores dos positivos ~ N(d,1), negativos ~ N(0,1), AUC = Phi(d/sqrt2). */
  function simular(auc, p, pct) {
    var d = Math.SQRT2 * inv(auc), pi = p.prevalencia, alvo = pct / 100;
    var lo = -10, hi = 10, t = 0;
    for (var i = 0; i < 80; i++) {
      t = (lo + hi) / 2;
      var f = pi * (1 - cdf(t - d)) + (1 - pi) * (1 - cdf(t));
      if (f > alvo) lo = t; else hi = t;
    }
    var tpr = 1 - cdf(t - d), fpr = 1 - cdf(t), n = p.baseClientes;
    var tp = n * pi * tpr, fp = n * (1 - pi) * fpr, fn = n * pi - tp, tn = n * (1 - pi) - fp;
    var salvos = tp * p.taxaSalvamento;
    var valor = salvos * p.valorCliente - (tp + fp) * p.custoAcao;
    return {
      pct: pct, vp: Math.round(tp), fp: Math.round(fp), fn: Math.round(fn), vn: Math.round(tn),
      precisao: tp + fp > 0 ? tp / (tp + fp) : 0, recall: tpr,
      acuracia: (tp + tn) / n, salvos: Math.round(salvos), custo: Math.round((tp + fp) * p.custoAcao),
      receitaSalva: Math.round(salvos * p.valorCliente), valor: Math.round(valor)
    };
  }

  function otimo(auc, p) {
    var melhor = null;
    for (var x = p.minPct; x <= p.maxPct + 1e-9; x += 0.5) {
      var s = simular(auc, p, x);
      if (!melhor || s.valor > melhor.valor) melhor = s;
    }
    return melhor;
  }

  /* Acurácia "no limiar padrão": o modelo aponta como positivos tantos clientes quanto a prevalência. */
  function acuraciaPadrao(auc, p) { return simular(auc, p, p.prevalencia * 100).acuracia; }

  return { cdf: cdf, inv: inv, simular: simular, otimo: otimo, acuraciaPadrao: acuraciaPadrao };
})();
if (typeof module !== 'undefined') module.exports = Stats;
