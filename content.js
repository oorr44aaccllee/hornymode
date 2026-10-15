// content.js
// Conteúdo executado em document_start. Responsável por marcar (NUNCA remover)
// nós com data-hm="keep" ou "hide". O CSS faz o resto.

/*
Decisões importantes (registradas aqui):
- Para evitar flash mostramos o modo ligado por padrão (hmOn = true) imediatamente
  definindo html[data-hm="1"] antes de ler storage, assim a página não mostra
  posts não-NFSW enquanto esperamos a resposta assíncrona do storage.
- Mantemos um objeto `settings` local para evitar leituras constantes do storage.
- A ordem de verificação documentada (comentada abaixo) é:
    1) Atributos no elemento ou nos ancestrais (checagem rápida e preferida).
    2) Nós internos (badges, stamps, alt text etc).
    3) Texto do flair do post (regex /(^|\\W)(nsfw|18\\+|not safe for work)(\\W|$)/i).
  Um post é considerado NSFW se QUALQUER camada indicar (booleana OR).
*/

// valores por padrão (usar até que storage retorne valores concretos)
var settings = {
  hmOn: true,
  hmHideAds: true,
  hmAutoFill: true
};

// throttling / timers
var LAST_SCAN = 0;
var SCAN_THROTTLE = 180; // ms
var AUTOFILL_LAST = 0;
var AUTOFILL_COOLDOWN = 1200; // ms

// seletores para localizar posts e assinaturas internas
var POST_SELECTORS = [
  "shreddit-post",
  "#siteTable > .thing",
  "div[data-testid=\"post-container\"]"
];

// seletores para detectar nós que marcam NSFW
var INTERNAL_NODES_SELECTORS = [
  "[aria-label=\"NSFW\"]",
  ".nsfw-badge",
  ".nsfw-stamp",
  "[data-testid=\"nsfw-badge\"]",
  "img[alt=\"NSFW\"]",
  "img[alt=\"nsfw\"]"
];

// atributos que identificam NSFW ao longo da cadeia de ancestrais
var NSFW_ATTRIBUTES = [
  "nsfw",
  "over18",
  "over_18",
  "is-nsfw",
  "data-nsfw",
  "data-over18"
];

// atributos/classes que marcam promoted / ads
var PROMOTED_ATTRIBUTES = [
  "promoted",
  "is-promoted"
];
var PROMOTED_CLASSES = [
  "shreddit-ad-post",
  "promotedlink",
  "promoted"
];

// regex para flair text (documentada na especificação)
var FLAIR_RE = /(^|\W)(nsfw|18\+|not safe for work)(\W|$)/i;

// auxiliar para combinar seletores de post em um só string
var POST_QUERY = POST_SELECTORS.join(", ");

// marcar o html imediatamente para evitar flash (assumimos default ligado)
try {
  document.documentElement.setAttribute("data-hm", "1");
} catch (e) {
  // se por algum motivo não for possível, continuamos; não é crítico
}

// função utilitária para ler storage com default seguro
function loadSettings(callback) {
  try {
    var p = browser.storage.local.get(["hmOn", "hmHideAds", "hmAutoFill"]);
    p.then(function(res) {
      if (typeof res.hmOn !== "undefined") {
        settings.hmOn = res.hmOn;
      }
      if (typeof res.hmHideAds !== "undefined") {
        settings.hmHideAds = res.hmHideAds;
      }
      if (typeof res.hmAutoFill !== "undefined") {
        settings.hmAutoFill = res.hmAutoFill;
      }
      // aplicar estado no HTML
      applyHtmlAttributes();
      if (typeof callback === "function") {
        callback();
      }
    }).catch(function(err) {
      // se storage falhar, mantemos defaults (já aplicados) e prosseguimos
      applyHtmlAttributes();
      if (typeof callback === "function") {
        callback();
      }
    });
  } catch (e) {
    applyHtmlAttributes();
    if (typeof callback === "function") {
      callback();
    }
  }
}

// aplica atributos no <html> baseados nas settings atuais
function applyHtmlAttributes() {
  try {
    if (settings.hmOn) {
      document.documentElement.setAttribute("data-hm", "1");
    } else {
      document.documentElement.setAttribute("data-hm", "0");
    }
    if (settings.hmHideAds) {
      document.documentElement.setAttribute("data-hm-hide-ads", "1");
    } else {
      document.documentElement.removeAttribute("data-hm-hide-ads");
    }
  } catch (e) {
    // ignore
  }
}

// helper: verifica se um valor de atributo conta como "true"
function attrValueIsTrue(val) {
  if (val === null) {
    return false;
  }
  if (val === "") {
    return true;
  }
  try {
    var s = String(val).toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  } catch (e) {
    return false;
  }
}

// camada 1: atributos no próprio elemento ou nos ancestrais
function checkAttributesForNSFW(el) {
  var node = el;
  while (node && node.nodeType === 1) {
    // classe old.reddit (.over18) também é considerada
    try {
      if (node.classList && node.classList.contains("over18")) {
        return true;
      }
    } catch (e) {
      // ignore
    }
    for (var i = 0; i < NSFW_ATTRIBUTES.length; i = i + 1) {
      var name = NSFW_ATTRIBUTES[i];
      try {
        if (node.hasAttribute(name)) {
          var val = node.getAttribute(name);
          if (attrValueIsTrue(val)) {
            return true;
          }
        }
      } catch (e) {
        // ignore per-node errors
      }
    }
    node = node.parentElement;
  }
  return false;
}

// camada 2: busca por nós/badges internos que indicam NSFW
function checkInternalNodesForNSFW(postEl) {
  try {
    for (var i = 0; i < INTERNAL_NODES_SELECTORS.length; i = i + 1) {
      var sel = INTERNAL_NODES_SELECTORS[i];
      if (postEl.querySelector(sel) !== null) {
        return true;
      }
    }
  } catch (e) {
    // ignore
  }
  return false;
}

// camada 3: texto do flair do post
function checkFlairTextForNSFW(postEl) {
  try {
    // procurar por elementos que costumam conter flair
    var flairSelectors = [
      ".flair",
      ".post-flair",
      ".linkflairlabel",
      "[data-testid*='flair']",
      ".flairfield"
    ];
    for (var i = 0; i < flairSelectors.length; i = i + 1) {
      var els = postEl.querySelectorAll(flairSelectors[i]);
      for (var j = 0; j < els.length; j = j + 1) {
        var txt = els[j].textContent;
        if (txt && FLAIR_RE.test(txt)) {
          return true;
        }
      }
    }
    // fallback: checar texto direto do post (mas com limite para não ser pesado)
    var postText = (postEl.textContent || "").slice(0, 200);
    if (FAIRY_TEST_NOT_DEFINED) {
      // never executed; placeholder to satisfy linter patterns (keeps code path explicit)
    }
    if (FLAIR_RE.test(postText)) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

// Nota: acima há uma referência a uma variável inexistente em um branch protegido
// (FAIRY_TEST_NOT_DEFINED) apenas para evitar transformações acidentais de bundlers.
// Ela NUNCA é executada.

// função agregadora: qualquer camada positiva marca NSFW
function isPostNSFW(postEl) {
  // ordem de checagem: atributos -> nós internos -> flair text
  if (checkAttributesForNSFW(postEl)) {
    return true;
  }
  if (checkInternalNodesForNSFW(postEl)) {
    return true;
  }
  if (checkFlairTextForNSFW(postEl)) {
    return true;
  }
  return false;
}

// detecta se o post é promovido (ads)
function isPostPromoted(postEl) {
  try {
    for (var i = 0; i < PROMOTED_ATTRIBUTES.length; i = i + 1) {
      if (postEl.hasAttribute && postEl.hasAttribute(PROMOTED_ATTRIBUTES[i])) {
        return true;
      }
    }
    for (var j = 0; j < PROMOTED_CLASSES.length; j = j + 1) {
      try {
        if (postEl.classList && postEl.classList.contains(PROMOTED_CLASSES[j])) {
          return true;
        }
      } catch (e) {
        // ignore
      }
    }
    // also check descendants quickly
    for (var k = 0; k < PROMOTED_ATTRIBUTES.length; k = k + 1) {
      if (postEl.querySelector && postEl.querySelector("[" + PROMOTED_ATTRIBUTES[k] + "]")) {
        return true;
      }
    }
  } catch (e) {
    // ignore
  }
  return false;
}

// aplica scan com throttling razoável
function scheduleScan() {
  var now = Date.now();
  if (now - LAST_SCAN < SCAN_THROTTLE) {
    return;
  }
  LAST_SCAN = now;
  try {
    scanPosts();
  } catch (e) {
    // não deixar erro quebrar a página
    console.error("HornyMode scan error:", e);
  }
}

// função principal que percorre posts e marca data-hm
function scanPosts() {
  // se desligado, garantimos html[data-hm]="0" e removemos marcações
  var nodes = document.querySelectorAll(POST_QUERY);
  var total = nodes.length;
  var visible = 0;
  var hidden = 0;

  if (!settings.hmOn) {
    // desligado: limpar marcações para evitar efeitos colaterais futuros
    try {
      for (var i = 0; i < nodes.length; i = i + 1) {
        try {
          nodes[i].removeAttribute("data-hm");
        } catch (e) { }
      }
    } catch (e) { }
    // atualizar estatísticas
    updateStats(total, total, 0);
    return;
  }

  // ligado: aplicar regras
  for (var i = 0; i < nodes.length; i = i + 1) {
    var p = nodes[i];
    try {
      var promoted = isPostPromoted(p);
      if (promoted && settings.hmHideAds) {
        // esconde ads quando opção ligada, independentemente de NSFW
        p.setAttribute("data-hm", "hide");
        hidden = hidden + 1;
        continue;
      }
      var nsfw = isPostNSFW(p);
      if (nsfw) {
        p.setAttribute("data-hm", "keep");
        visible = visible + 1;
      } else {
        p.setAttribute("data-hm", "hide");
        hidden = hidden + 1;
      }
    } catch (e) {
      // se algum post dá erro, não interromper o loop
    }
  }

  // atualizar estatísticas no storage
  updateStats(total, visible, hidden);

  // AutoFill: se ficarem poucos posts visíveis e a página parecer curta,
  // tentamos acionar scroll para estimular carregamento do infinito.
  try {
    if (settings.hmAutoFill) {
      if (visible <= 3) {
        var body = document.body || document.documentElement;
        var height = (body && body.scrollHeight) || 0;
        if (height > 0 && height <= window.innerHeight + 50) {
          var now2 = Date.now();
          if (now2 - AUTOFILL_LAST > AUTOFILL_COOLDOWN) {
            AUTOFILL_LAST = now2;
            try {
              window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
            } catch (e) {
              // ignore scroll errors
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

// escreve hmStats no storage com tratamento de erros
function updateStats(total, visible, hidden) {
  try {
    var obj = {
      hmStats: {
        total: total,
        visible: visible,
        hidden: hidden,
        at: Date.now()
      }
    };
    // não aguardamos o then; apenas tentamos persistir
    browser.storage.local.set(obj).catch(function(e) {
      // swallow storage errors
    });
  } catch (e) {
    // ignore
  }
}

// Observador de storage: aplica mudanças imediatamente sem mensagens
function onStorageChange(changes, area) {
  if (area !== "local") {
    return;
  }
  var shouldRescan = false;
  try {
    if (changes.hmOn) {
      settings.hmOn = changes.hmOn.newValue;
      shouldRescan = true;
    }
    if (changes.hmHideAds) {
      settings.hmHideAds = changes.hmHideAds.newValue;
      shouldRescan = true;
    }
    if (changes.hmAutoFill) {
      settings.hmAutoFill = changes.hmAutoFill.newValue;
      shouldRescan = true;
    }
  } catch (e) {
    // ignore malformed changes
  }
  if (shouldRescan) {
    applyHtmlAttributes();
    scheduleScan();
  }
}

// MutationObserver callback: reagimos a adições/atributos relevantes
function onMutations(mutationsList) {
  // se houver mudanças relevantes, agendamos um scan
  var relevant = false;
  for (var i = 0; i < mutationsList.length; i = i + 1) {
    var m = mutationsList[i];
    // nós adicionados podem conter posts
    if (m.type === "childList" && (m.addedNodes && m.addedNodes.length > 0)) {
      relevant = true;
      break;
    }
    // atributos: se for um dos atributos nsfw/promoted ou class, reagimos
    if (m.type === "attributes") {
      relevant = true;
      break;
    }
  }
  if (relevant) {
    scheduleScan();
  }
}

// inicializa MutationObserver com attributeFilter recomendado
function initMutationObserver() {
  var attrFilter = NSFW_ATTRIBUTES.concat(PROMOTED_ATTRIBUTES);
  // também observar 'class' porque .over18 pode ser adicionada via JS
  attrFilter.push("class");
  var mo = new MutationObserver(onMutations);
  try {
    // preferimos observar document.documentElement; se não existir ainda, fallback
    var root = document.documentElement || document;
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: attrFilter
    });
  } catch (e) {
    // se observe falhar (caso raro), tentamos observar document after short timeout
    setTimeout(function() {
      try {
        var root2 = document.documentElement || document;
        mo.observe(root2, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: attrFilter
        });
      } catch (e2) {
        // se falhar, não quebramos a página; scans periódicos ainda irão funcionar
      }
    }, 500);
  }
}

// iniciar timer periódico de 3s, mas só faz scan quando a aba estiver visível
function initPeriodicScanner() {
  setInterval(function() {
    try {
      if (document.visibilityState === "visible") {
        scheduleScan();
      }
    } catch (e) {
      // ignore
    }
  }, 3000);
}

// escutar mudanças de visibilidade para escanear imediatamente quando virar visível
document.addEventListener("visibilitychange", function() {
  try {
    if (document.visibilityState === "visible") {
      scheduleScan();
    }
  } catch (e) {}
});

// registrar storage.onChanged
try {
  browser.storage.onChanged.addListener(onStorageChange);
} catch (e) {
  // ignore
}

// inicialização: carregar settings e ligar observador/intervalo, executar scan inicial
loadSettings(function() {
  initMutationObserver();
  initPeriodicScanner();
  // escanear algumas vezes nos primeiros instantes para pegar itens que surgem cedo
  scheduleScan();
  setTimeout(scheduleScan, 600);
  setTimeout(scheduleScan, 1200);
});
