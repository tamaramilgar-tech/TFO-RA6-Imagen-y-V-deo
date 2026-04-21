const APP = JSON.parse(document.getElementById("app-data").textContent);
const PASS_SCORE = 8;
const MAX_ATTEMPTS = 2;
const QUESTIONS_PER_TEST = 10;
const STORAGE_KEY = "ra6_videojuego_progress_v4";
const LEGACY_STORAGE_KEYS = [
  "ra6_videojuego_progress_v3",
  "ra6_videojuego_progress_v2",
  "ra6_videojuego_progress_v1",
  "ra6_videojuego_progress"
];
const TEACHER_USER = "tmilgar";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getTodayCode() {
  const d = new Date();
  return (
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    String(d.getFullYear()).slice(-2)
  );
}

function createEmptyState() {
  return {
    studentName: "",
    teacherMode: false,
    verified: {},
    passed: {},
    completed: {},
    attempts: {},
    best: {},
    percent: {},
    results: {}
  };
}

function normalizeState(raw = {}) {
  const s = { ...createEmptyState(), ...raw };

  s.verified = s.verified && typeof s.verified === "object" ? s.verified : {};
  s.passed = s.passed && typeof s.passed === "object" ? s.passed : {};
  s.completed = s.completed && typeof s.completed === "object" ? s.completed : {};
  s.attempts = s.attempts && typeof s.attempts === "object" ? s.attempts : {};
  s.best = s.best && typeof s.best === "object" ? s.best : {};
  s.percent = s.percent && typeof s.percent === "object" ? s.percent : {};
  s.results = s.results && typeof s.results === "object" ? s.results : {};

  APP.phases.forEach((phase) => {
    const id = phase.id;
    const legacyAttempts = Array.isArray(s.attempts[id]) ? s.attempts[id] : [];

    s.attempts[id] = legacyAttempts.map((item) => {
      if (typeof item === "number") {
        return {
          score: item,
          percent: Math.round((item / QUESTIONS_PER_TEST) * 100),
          answers: [],
          questions: []
        };
      }
      return {
        score: Number(item.score || 0),
        percent: Number(item.percent ?? Math.round((Number(item.score || 0) / QUESTIONS_PER_TEST) * 100)),
        answers: Array.isArray(item.answers) ? item.answers : [],
        questions: Array.isArray(item.questions) ? item.questions : []
      };
    });

    if (!s.completed[id] && s.passed[id]) {
      s.completed[id] = true;
    }

    if (typeof s.best[id] !== "number") {
      s.best[id] = s.attempts[id].reduce((max, attempt) => Math.max(max, Number(attempt.score || 0)), 0);
    }

    if (typeof s.percent[id] !== "number") {
      s.percent[id] = s.attempts[id].reduce((max, attempt) => Math.max(max, Number(attempt.percent || 0)), 0);
    }

    if (!s.results[id] && (s.completed[id] || s.passed[id] || s.attempts[id].length)) {
      s.results[id] = {
        status: s.passed[id]
          ? "Superado"
          : s.completed[id]
          ? "No superado"
          : "Pendiente",
        passed: !!s.passed[id],
        score: s.best[id] || 0,
        percent: s.percent[id] || 0
      };
    }
  });

  s.teacherMode = normalizeText(s.studentName) === TEACHER_USER || !!s.teacherMode;
  return s;
}

function findLegacyState() {
  const seen = new Set([STORAGE_KEY]);
  const dynamicKeys = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("ra6_videojuego_progress") && !seen.has(key)) {
      dynamicKeys.push(key);
      seen.add(key);
    }
  }

  const candidates = [...LEGACY_STORAGE_KEYS, ...dynamicKeys];

  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      return normalizeState(parsed);
    } catch (error) {
      // continúa con el siguiente candidato
    }
  }

  return createEmptyState();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeState(JSON.parse(raw));
    }
  } catch (error) {
    // si el JSON falla, intentamos migrar desde estados previos
  }

  const migrated = findLegacyState();
  saveState(migrated);
  return migrated;
}

function saveState(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(s)));
}

function isTeacherMode(state = loadState()) {
  return normalizeText(state.studentName) === TEACHER_USER || !!state.teacherMode;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function phaseIndex(id) {
  return APP.phases.findIndex((p) => p.id === id);
}

function isAccessible(id, s) {
  if (isTeacherMode(s)) return true;
  const idx = phaseIndex(id);
  if (idx === 0) return true;
  const previous = APP.phases[idx - 1];
  return !!s.completed[previous.id];
}

function allCompleted(s) {
  if (isTeacherMode(s)) return true;
  return APP.phases.every((p) => s.completed[p.id]);
}

function buildQuestionSet(id) {
  return shuffle(APP.questions[id])
    .slice(0, QUESTIONS_PER_TEST)
    .map((q) => {
      const opts = q[1].map((txt, i) => ({ txt, original: i }));
      const shuffled = shuffle(opts);
      return {
        q: q[0],
        options: shuffled.map((x) => x.txt),
        answer: shuffled.findIndex((x) => x.original === q[2])
      };
    });
}

function nextPhaseButton(phaseId) {
  const idx = phaseIndex(phaseId);
  if (idx === APP.phases.length - 1) {
    return `<div class="actions"><a class="btn pixel-btn" href="certificado.html">Ir al certificado final</a></div>`;
  }
  return `<div class="actions"><a class="btn pixel-btn" href="${APP.phases[idx + 1].file}">Ir a la siguiente fase</a></div>`;
}

function renderHUD() {
  const s = loadState();
  const completed = APP.phases.filter((p) => s.completed[p.id]).length;
  const total = APP.phases.length;

  document.querySelectorAll("[data-year]").forEach((e) => {
    e.textContent = new Date().getFullYear();
  });

  document.querySelectorAll("[data-progress-fill]").forEach((bar) => {
    bar.style.width = `${Math.round((completed / total) * 100)}%`;
  });

  document.querySelectorAll("[data-progress-text]").forEach((t) => {
    t.textContent = isTeacherMode(s)
      ? "Modo docente activo"
      : `${completed}/${total} fases completadas`;
  });

  const input = document.getElementById("student-name");
  if (input) input.value = s.studentName || "";

  const badge = document.getElementById("student-badge");
  if (badge) {
    badge.textContent = isTeacherMode(s)
      ? `Docente: ${s.studentName || TEACHER_USER}`
      : s.studentName
      ? `Jugador: ${s.studentName}`
      : "Jugador sin registrar";
  }

  document.querySelectorAll("[data-phase-card]").forEach((card) => {
    const id = card.dataset.phaseCard;
    const st = card.querySelector("[data-status]");
    const accessible = isAccessible(id, s);
    const passed = !!s.passed[id];
    const completedPhase = !!s.completed[id];

    if (st) {
      if (isTeacherMode(s)) {
        st.textContent = "Modo docente";
        st.className = "phase-status open";
      } else if (passed) {
        st.textContent = "Superada";
        st.className = "phase-status ok";
      } else if (completedPhase) {
        st.textContent = "Completada";
        st.className = "phase-status warn";
      } else if (accessible) {
        st.textContent = "Disponible";
        st.className = "phase-status open";
      } else {
        st.textContent = "Bloqueada";
        st.className = "phase-status lock";
      }
    }

    card.classList.toggle("locked", !accessible);
  });

  document.querySelectorAll("[data-cert-link]").forEach((link) => {
    if (!allCompleted(s)) {
      link.classList.add("locked-link");
      link.onclick = (e) => e.preventDefault();
    } else {
      link.classList.remove("locked-link");
      link.onclick = null;
    }
  });
}

function saveStudentName() {
  const s = loadState();
  const input = document.getElementById("student-name");
  s.studentName = input ? input.value.trim() : "";
  s.teacherMode = normalizeText(s.studentName) === TEACHER_USER;
  saveState(s);
  renderHUD();

  const msg = document.getElementById("student-msg");
  if (msg) {
    msg.textContent = s.studentName
      ? isTeacherMode(s)
        ? "Acceso docente activado. Puedes revisar fases y test sin validación ni intentos."
        : "Nombre guardado correctamente. Si vienes de la versión anterior, tu progreso previo se conserva."
      : "Escribe un nombre para guardarlo.";
  }
}

function resetProgress() {
  const keysToRemove = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("ra6_videojuego_progress")) {
      keysToRemove.push(key);
    }
  }
  Array.from(new Set(keysToRemove)).forEach((key) => localStorage.removeItem(key));
  location.reload();
}

function toggleGuide(id) {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.toggle("hidden");
  const button = document.querySelector(`[data-guide-target="${id}"]`);
  if (button) {
    button.textContent = element.classList.contains("hidden")
      ? button.dataset.labelOpen || "Ver guía"
      : button.dataset.labelClose || "Ocultar guía";
  }
}

function renderVerification(id) {
  const box = document.getElementById("verification-box");
  if (!box) return;

  const s = loadState();

  if (isTeacherMode(s)) {
    box.innerHTML = `
      <section class="panel game-panel">
        <h2>Acceso docente</h2>
        <p>Usuario <strong>${s.studentName || TEACHER_USER}</strong> detectado. Esta fase queda accesible sin validación docente ni necesidad de realizar el test.</p>
      </section>
    `;
    return;
  }

  const done = !!s.verified[id];
  box.innerHTML = `
    <section class="panel game-panel">
      <h2>Control del docente</h2>
      <p>Cuando hayas subido la práctica a EVAGD, introduce el código de validación facilitado por el profesorado para activar el test de esta fase.</p>
      <div class="verify-row">
        <input type="password" id="verify-input" placeholder="Código de validación" ${done ? "disabled" : ""}>
        <button class="btn pixel-btn" id="verify-btn" ${done ? "disabled" : ""}>
          ${done ? "Fase validada" : "Validar práctica"}
        </button>
      </div>
      <p class="mini" id="verify-msg">${done ? "La práctica ya está validada. Puedes realizar el test." : ""}</p>
    </section>
  `;

  if (!done) {
    document.getElementById("verify-btn").onclick = () => {
      const val = normalizeText(document.getElementById("verify-input").value);
      const msg = document.getElementById("verify-msg");

      if (val === getTodayCode()) {
        const st = loadState();
        st.verified[id] = true;
        saveState(st);
        renderVerification(id);
        renderTest(id);
        msg.textContent = "Código correcto. Test desbloqueado.";
      } else {
        msg.textContent = "Código incorrecto. Revisa el código facilitado por el profesorado.";
      }
    };
  }
}

function registerAttemptResult(id, score, answers, questions) {
  const s = loadState();
  const percent = Math.round((score / QUESTIONS_PER_TEST) * 100);

  s.attempts[id] ||= [];
  s.attempts[id].push({ score, percent, answers, questions });
  s.best[id] = Math.max(s.best[id] || 0, score);
  s.percent[id] = Math.max(s.percent[id] || 0, percent);

  const passed = score >= PASS_SCORE;
  const exhausted = s.attempts[id].length >= MAX_ATTEMPTS;

  if (passed) {
    s.passed[id] = true;
    s.completed[id] = true;
    s.results[id] = {
      status: "Superado",
      passed: true,
      score,
      percent
    };
  } else if (exhausted) {
    s.passed[id] = false;
    s.completed[id] = true;
    s.results[id] = {
      status: "No superado",
      passed: false,
      score: s.best[id],
      percent: s.percent[id]
    };
  } else {
    s.results[id] = {
      status: "Pendiente",
      passed: false,
      score: s.best[id],
      percent: s.percent[id]
    };
  }

  saveState(s);
  return s;
}

function renderTeacherReview(id) {
  const questions = APP.questions[id] || [];
  let html = `
    <section class="panel game-panel">
      <div class="test-head">
        <div>
          <h2>Modo docente · Revisión del test</h2>
          <p>Puedes visualizar todas las preguntas y la respuesta correcta sin realizar el test ni registrar intentos.</p>
        </div>
        <span class="attempt-pill">Vista docente</span>
      </div>
      <div class="teacher-review">
  `;

  questions.forEach((q, i) => {
    html += `
      <fieldset class="qbox teacher-qbox">
        <legend>${i + 1}. ${q[0]}</legend>
    `;

    q[1].forEach((opt, j) => {
      const isCorrect = j === q[2];
      html += `
        <label class="opt ${isCorrect ? "teacher-correct" : "teacher-neutral"}">
          <input type="radio" disabled ${isCorrect ? "checked" : ""}>
          <span>${String.fromCharCode(97 + j)}) ${opt}${isCorrect ? " <strong>✔ Correcta</strong>" : ""}</span>
        </label>
      `;
    });

    html += `</fieldset>`;
  });

  html += `
      </div>
      ${nextPhaseButton(id)}
    </section>
  `;

  return html;
}

function renderTest(id) {
  const box = document.getElementById("test-box");
  if (!box) return;

  const s = loadState();

  if (isTeacherMode(s)) {
    box.innerHTML = renderTeacherReview(id);
    return;
  }

  if (!s.verified[id]) {
    box.innerHTML = `
      <section class="panel game-panel">
        <h2>Test bloqueado</h2>
        <p>El test se activa después de la validación del docente.</p>
      </section>
    `;
    return;
  }

  if (s.completed[id]) {
    const result = s.results[id] || {};
    box.innerHTML = `
      <section class="panel game-panel">
        <h2>${s.passed[id] ? "Fase superada" : "Fase completada"}</h2>
        <p>
          ${s.passed[id]
            ? `Has alcanzado el 80% o más. Mejor resultado: <strong>${result.percent ?? s.percent[id] ?? 0}%</strong>.`
            : `Has agotado los ${MAX_ATTEMPTS} intentos. Mejor resultado registrado: <strong>${result.percent ?? s.percent[id] ?? 0}%</strong>.`}
        </p>
        <p>${s.passed[id] ? "Ya puedes continuar la aventura." : "Puedes continuar a la siguiente fase, pero esta quedará registrada como no superada."}</p>
        ${nextPhaseButton(id)}
      </section>
    `;
    return;
  }

  const used = (s.attempts[id] || []).length;
  const questions = buildQuestionSet(id);

  box.innerHTML = `
    <section class="panel game-panel">
      <div class="test-head">
        <div>
          <h2>Desafío de fase</h2>
          <p>Necesitas 8 de 10 para superar esta misión. Dispones de hasta ${MAX_ATTEMPTS} intentos.</p>
        </div>
        <span class="attempt-pill">Intento ${used + 1} de ${MAX_ATTEMPTS}</span>
      </div>
      <form id="phase-test"></form>
      <div id="test-feedback"></div>
    </section>
  `;

  const form = document.getElementById("phase-test");
  questions.forEach((q, i) => {
    const fs = document.createElement("fieldset");
    fs.className = "qbox";
    fs.innerHTML = `<legend>${i + 1}. ${q.q}</legend>`;

    q.options.forEach((opt, j) => {
      const label = document.createElement("label");
      label.className = "opt";
      label.innerHTML = `
        <input type="radio" name="q${i}" value="${j}">
        <span>${String.fromCharCode(97 + j)}) ${opt}</span>
      `;
      fs.appendChild(label);
    });

    form.appendChild(fs);
  });

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.innerHTML = `<button class="btn pixel-btn" type="submit">Enviar intento</button>`;
  form.appendChild(actions);

  form.onsubmit = (e) => {
    e.preventDefault();
    let score = 0;
    const answers = [];

    questions.forEach((q, i) => {
      const selected = form.querySelector(`input[name="q${i}"]:checked`);
      const value = selected ? Number(selected.value) : null;
      answers.push(value);
      if (value === q.answer) score += 1;
    });

    registerAttemptResult(id, score, answers, questions);
    renderHUD();
    renderTest(id);
    renderSummary(id);
  };
}

function renderSummary(id) {
  const box = document.getElementById("summary-box");
  if (!box) return;

  const s = loadState();

  if (isTeacherMode(s)) {
    box.innerHTML = `
      <section class="panel game-panel">
        <h2>Panel de progreso</h2>
        <p>Modo docente activo. No se registran intentos de test durante la revisión.</p>
      </section>
    `;
    return;
  }

  const attempts = s.attempts[id] || [];
  if (!attempts.length) {
    box.innerHTML = `
      <section class="panel game-panel">
        <h2>Panel de progreso</h2>
        <p>Aún no hay intentos registrados en esta fase.</p>
      </section>
    `;
    return;
  }

  let html = `<section class="panel game-panel"><h2>Panel de progreso</h2><div class="attempt-grid">`;
  attempts.forEach((a, i) => {
    html += `
      <article class="attempt-card">
        <h3>Intento ${i + 1}</h3>
        <p>Puntuación: <strong>${a.score}/10</strong></p>
        <p>Porcentaje: <strong>${a.percent}%</strong></p>
      </article>
    `;
  });
  html += `</div>`;

  const remaining = MAX_ATTEMPTS - attempts.length;
  const result = s.results[id] || {};

  if (s.passed[id]) {
    html += `<div class="banner success">¡Misión completada! Has superado la fase con ${result.percent ?? s.percent[id] ?? 0}% de acierto.</div>${nextPhaseButton(id)}`;
  } else if (s.completed[id]) {
    html += `<div class="banner warn">No se ha superado la fase tras ${MAX_ATTEMPTS} intentos. Se registra el mejor resultado (${result.percent ?? s.percent[id] ?? 0}%) y se desbloquea la siguiente misión.</div>${nextPhaseButton(id)}`;
  } else if (remaining > 0) {
    html += `<div class="banner warn">Todavía no alcanzas el 80%. Te queda ${remaining} intento(s). Puedes volver a intentarlo.</div>`;
  }

  if (s.completed[id] && !s.passed[id]) {
    attempts.forEach((a, idx) => {
      html += `<div class="correction"><h3>Autocorrección del intento ${idx + 1}</h3>`;
      a.questions.forEach((q, i) => {
        const ok = a.answers[i] === q.answer;
        html += `
          <div class="corr-item ${ok ? "ok" : "ko"}">
            <p><strong>${i + 1}. ${q.q}</strong></p>
            <p>Tu respuesta: ${q.options[a.answers[i]] || "Sin responder"}</p>
            <p>Correcta: <strong>${q.options[q.answer]}</strong></p>
          </div>
        `;
      });
      html += `</div>`;
    });
  }

  box.innerHTML = html + `</section>`;
}

function renderPhasePage() {
  const id = document.body.dataset.phase;
  if (!id) return;

  const s = loadState();
  if (!isAccessible(id, s)) {
    document.getElementById("phase-shell").innerHTML = `
      <section class="panel game-panel">
        <h2>Zona bloqueada</h2>
        <p>Debes completar la fase anterior para continuar la aventura.</p>
        <a class="btn pixel-btn" href="index.html">Volver al mapa</a>
      </section>
    `;
    return;
  }

  renderVerification(id);
  renderTest(id);
  renderSummary(id);
}

function renderCertificate() {
  if (!document.body.classList.contains("certificate-page")) return;

  const s = loadState();
  const gate = document.getElementById("cert-gate");
  const panel = document.getElementById("cert-panel");

  if (!allCompleted(s)) {
    gate.innerHTML = `
      <section class="panel game-panel">
        <h2>Certificado bloqueado</h2>
        <p>Debes completar las seis misiones para obtener el certificado final.</p>
        <a class="btn pixel-btn" href="index.html">Volver al mapa</a>
      </section>
    `;
    panel.innerHTML = "";
    return;
  }

  gate.innerHTML = `
    <section class="panel game-panel">
      <h2>Certificado final disponible</h2>
      <p>Se han completado todas las fases del itinerario.</p>
    </section>
  `;

  const rows = APP.phases
    .map((p) => {
      if (isTeacherMode(s)) {
        return `<tr><td>${p.title}</td><td>Revisión docente</td><td>—</td><td>Acceso directo</td></tr>`;
      }
      const result = s.results[p.id] || {
        status: s.passed[p.id] ? "Superado" : s.completed[p.id] ? "No superado" : "Sin registro",
        percent: s.percent[p.id] ?? 0
      };
      return `<tr><td>${p.title}</td><td>${result.status}</td><td>${result.percent}%</td><td>${s.passed[p.id] ? "Sí" : "No"}</td></tr>`;
    })
    .join("");

  panel.innerHTML = `
    <section class="panel game-panel">
      <div class="cert-sheet">
        <p class="cert-kicker">Certificado de aprovechamiento</p>
        <h1>RA6 · Aventura multimedia</h1>
        <p>Se certifica que</p>
        <h2>${s.studentName || "Alumno no registrado"}</h2>
        <p>${isTeacherMode(s) ? "ha revisado el itinerario completo en modo docente." : "ha completado el itinerario por fases, quedando registradas las pruebas realizadas y el porcentaje alcanzado en cada misión."}</p>
        <table class="cert-table">
          <thead>
            <tr>
              <th>Fase</th>
              <th>Resultado</th>
              <th>Porcentaje</th>
              <th>¿Superada?</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="mini">Fecha de emisión: ${new Date().toLocaleDateString("es-ES")}</p>
      </div>
      <div class="actions">
        <button class="btn pixel-btn" onclick="window.print()">Imprimir / Guardar en PDF</button>
      </div>
    </section>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  renderHUD();

  const save = document.getElementById("save-student");
  if (save) save.onclick = saveStudentName;

  const reset = document.getElementById("reset-progress");
  if (reset) reset.onclick = resetProgress;

  document.querySelectorAll("[data-guide-target]").forEach((button) => {
    button.onclick = () => toggleGuide(button.dataset.guideTarget);
  });

  renderPhasePage();
  renderCertificate();
});
