// ============================================================
// MOTOR DEL JUEGO - NIVEL 1
// Este archivo es el "cerebro" del juego en tiempo real.
// ============================================================

// --- 1. OBTENER EL LIENZO ---
// Le decimos al navegador que use el canvas del HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d'); // "ctx" es el lápiz con el que dibujamos

// --- 2. DEFINIR AL PERSONAJE (BirraMan) ---
const birraman = {
    x: 100,
    y: 290,
    width: 56,
    height: 100,  // Proporciones Metal Slug
    color: '#8B4513',

    // FÍSICA:
    velocityX: 0,
    velocityY: 0,
    speed: 6,
    aceleracion: 1.2,
    friccion: 0.80,
    jumpForce: -17,
    isOnGround: false,
    saltoPulsado: false,

    // ANIMACIÓN:
    facingRight: true,   // Dirección a la que mira
    state: 'idle',       // Estado actual: 'idle' | 'run' | 'jump' | 'attack'
    attackTimer: 0,      // Contador para duración del ataque
    ATTACK_DURATION: 25, // Frames que dura la animación de ataque
};

// --- 3. LA GRAVEDAD ---
// Usamos dos valores: gravedad normal al subir y más fuerte al caer.
// Esto hace que la curva del salto sea más bonita (sube rápido, baja suave).
const GRAVEDAD_SUBIDA = 0.55;  // Gravedad mientras sube
const GRAVEDAD_BAJADA = 0.85;  // Gravedad mientras baja (cae más rápido, sensación de peso)

// --- 4. EL SUELO Y LAS PLATAFORMAS ---
// Cada plataforma es un rectángulo con posición (x,y) y tamaño (w,h)
const plataformas = [
    // El suelo: una plataforma larga en la parte de abajo
    { x: 0,   y: 440, w: 800, h: 60,  color: '#5D4037' },

    // Plataformas flotantes para saltar (las iremos ajustando)
    { x: 150, y: 340, w: 150, h: 20,  color: '#795548' },
    { x: 400, y: 270, w: 150, h: 20,  color: '#795548' },
    { x: 600, y: 180, w: 150, h: 20,  color: '#795548' },
];

// --- 5. CONTROL DEL TECLADO ---
const teclasPulsadas = {};

document.addEventListener('keydown', (e) => {
    if (!teclasPulsadas[e.code]) {
        // Iniciar ataque con X o Z (una sola vez por pulsación)
        if ((e.code === 'KeyX' || e.code === 'KeyZ') && birraman.attackTimer <= 0) {
            birraman.attackTimer = birraman.ATTACK_DURATION;
        }
    }
    teclasPulsadas[e.code] = true;
});

document.addEventListener('keyup', (e) => {
    teclasPulsadas[e.code] = false;
});

// --- 6. SPRITE SHEET DEL PERSONAJE ---
// Sprite sheet v4 con fondo VERDE LIMA (#00FF00) puro — sin etiquetas de texto.
// Layout: 2 filas en una imagen 1024×1024
//
//   ROW 0 (y=0..511):    [IDLE]   [RUN-A]   [RUN-B]   ← 3 columnas de 341px
//   ROW 1 (y=512..1023): [ATTACK] [JUMP]               ← 2 columnas
//
const FRAME_W = Math.floor(1024 / 3);  // 341px de ancho por frame
const FRAME_H = Math.floor(1024 / 2);  // 512px de alto por fila

// Añadimos un margen para recortar el sangrado (bleeding) de los frames adyacentes
// Ajustado a 10px y 15px para limpiar los bordes sin cortar el martillo del personaje.
const MARGIN_X = 10;
const MARGIN_Y = 15;

const FRAMES_ABS = {
    idle:   [ { sx: 0*FRAME_W + MARGIN_X, sy: 0 + MARGIN_Y,       sw: FRAME_W - MARGIN_X*2, sh: FRAME_H - MARGIN_Y*2 } ],
    run:    [ { sx: 1*FRAME_W + MARGIN_X, sy: 0 + MARGIN_Y,       sw: FRAME_W - MARGIN_X*2, sh: FRAME_H - MARGIN_Y*2 },
              { sx: 2*FRAME_W + MARGIN_X, sy: 0 + MARGIN_Y,       sw: FRAME_W - MARGIN_X*2, sh: FRAME_H - MARGIN_Y*2 } ],
    attack: [ { sx: 0*FRAME_W + MARGIN_X, sy: FRAME_H + MARGIN_Y, sw: FRAME_W - MARGIN_X*2, sh: FRAME_H - MARGIN_Y*2 } ],
    jump:   [ { sx: 1*FRAME_W + MARGIN_X, sy: FRAME_H + MARGIN_Y, sw: FRAME_W - MARGIN_X*2, sh: FRAME_H - MARGIN_Y*2 } ],
};

const ANIMACIONES = {
    idle:   { frames: FRAMES_ABS.idle,   fps: 2 },
    run:    { frames: FRAMES_ABS.run,    fps: 8 },
    attack: { frames: FRAMES_ABS.attack, fps: 4 },
    jump:   { frames: FRAMES_ABS.jump,   fps: 4 },
};

// Cargamos el sprite sheet y eliminamos el fondo verde lima (#00FF00) con color-key.
// Verde lima: R≈0, G≈255, B≈0 — no aparece en ningún pixel del personaje.
const spriteSheet = new Image();
let spriteLoaded = false;
let spriteCanvas = null;

spriteSheet.onload = () => {
    spriteCanvas = document.createElement('canvas');
    spriteCanvas.width  = spriteSheet.naturalWidth;
    spriteCanvas.height = spriteSheet.naturalHeight;
    const offCtx = spriteCanvas.getContext('2d');
    offCtx.drawImage(spriteSheet, 0, 0);

    // Color-key: Tomamos el píxel (0,0) como color de fondo dinámicamente
    const imgData = offCtx.getImageData(0, 0, spriteCanvas.width, spriteCanvas.height);
    const data = imgData.data;
    
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        
        // Calculamos la diferencia con el color de fondo
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        
        if (diff < 80) {
            // Fondo puro o muy similar -> Transparente total
            data[i + 3] = 0;
        } else if (diff < 160) {
            // Bordes suavizados -> Semi-transparencia gradual
            const alphaRatio = (diff - 80) / 80;
            data[i + 3] = Math.round(data[i + 3] * alphaRatio);
        }
    }
    offCtx.putImageData(imgData, 0, 0);
    spriteLoaded = true;
};

spriteSheet.src = 'assets/sprites/birraman_spritesheet.png';

// Contador de tiempo para la animación

let animFrame   = 0;  // Frame actual dentro de la animación
let animTimer   = 0;  // Contador de frames de juego transcurridos


// ============================================================
// FUNCIÓN DE ACTUALIZACIÓN (el "cerebro" que se repite 60/seg)
// ============================================================
function actualizar() {

    // --- MOVIMIENTO HORIZONTAL CON INERCIA ---
    if (teclasPulsadas['ArrowRight'] || teclasPulsadas['KeyD']) {
        birraman.velocityX = Math.min(
            birraman.velocityX + birraman.aceleracion,
            birraman.speed
        );
        birraman.facingRight = true; // Actualizar dirección
    } else if (teclasPulsadas['ArrowLeft'] || teclasPulsadas['KeyA']) {
        birraman.velocityX = Math.max(
            birraman.velocityX - birraman.aceleracion,
            -birraman.speed
        );
        birraman.facingRight = false; // Actualizar dirección
    } else {
        birraman.velocityX *= birraman.friccion;
        if (Math.abs(birraman.velocityX) < 0.2) birraman.velocityX = 0;
    }

    // --- SALTO CON GRAVEDAD VARIABLE ---
    if ((teclasPulsadas['Space'] || teclasPulsadas['ArrowUp'] || teclasPulsadas['KeyW'])
        && birraman.isOnGround && !birraman.saltoPulsado) {
        birraman.velocityY = birraman.jumpForce;
        birraman.isOnGround = false;
        birraman.saltoPulsado = true;
    }
    if (!teclasPulsadas['Space'] && !teclasPulsadas['ArrowUp'] && !teclasPulsadas['KeyW']) {
        birraman.saltoPulsado = false;
    }

    // --- TIMER DE ATAQUE ---
    if (birraman.attackTimer > 0) {
        birraman.attackTimer--;
    }

    // --- GRAVEDAD VARIABLE ---
    // Si va hacia arriba usamos gravedad suave, si cae usamos gravedad fuerte
    if (birraman.velocityY < 0) {
        birraman.velocityY += GRAVEDAD_SUBIDA; // Subiendo
    } else {
        birraman.velocityY += GRAVEDAD_BAJADA; // Cayendo
    }

    // Velocidad máxima de caída (para que no acelere infinitamente)
    if (birraman.velocityY > 18) birraman.velocityY = 18;

    // --- APLICAR VELOCIDADES A LA POSICIÓN ---
    birraman.x += birraman.velocityX;
    birraman.y += birraman.velocityY;

    // --- LÍMITES DEL ESCENARIO (que no se salga del canvas) ---
    if (birraman.x < 0) birraman.x = 0;
    if (birraman.x + birraman.width > canvas.width) birraman.x = canvas.width - birraman.width;

    // --- COLISIÓN CON PLATAFORMAS ---
    // Comprobamos si BirraMan ha aterrizado en alguna plataforma
    birraman.isOnGround = false; // Asumimos que está en el aire

    for (const p of plataformas) {
        // Comprobación de colisión clásica (si los dos rectángulos se superponen)
        if (
            birraman.velocityY >= 0 &&                    // Solo colisionar si está cayendo
            birraman.x + birraman.width  > p.x &&         // BirraMan no está a la izquierda
            birraman.x                   < p.x + p.w &&   // BirraMan no está a la derecha
            birraman.y + birraman.height > p.y &&         // Parte de abajo de BirraMan toca la plataforma
            birraman.y + birraman.height < p.y + p.h + birraman.velocityY + 5 // Viene de arriba
        ) {
            // ¡Aterrizó! Lo colocamos exactamente encima de la plataforma
            birraman.y = p.y - birraman.height;
            birraman.velocityY = 0;     // Frenamos la caída
            birraman.isOnGround = true; // Está en el suelo → puede saltar
        }
    }

    // Si cae fuera del canvas por abajo → lo recolocamos arriba
    if (birraman.y > canvas.height + 100) {
        birraman.x = 100;
        birraman.y = 300;
        birraman.velocityY = 0;
    }

    // --- DETERMINAR ESTADO DE ANIMACIÓN ---
    // Calculamos el nuevo estado y reseteamos animFrame si cambia,
    // para evitar índices fuera de rango al pasar de run(2 frames) a jump(1 frame).
    let nuevoEstado;
    if (birraman.attackTimer > 0) {
        nuevoEstado = 'attack';
    } else if (!birraman.isOnGround) {
        nuevoEstado = 'jump';
    } else if (Math.abs(birraman.velocityX) > 0.5) {
        nuevoEstado = 'run';
    } else {
        nuevoEstado = 'idle';
    }

    // Si el estado cambió, reseteamos el frame y el timer
    if (nuevoEstado !== birraman.state) {
        birraman.state = nuevoEstado;
        animFrame = 0;
        animTimer = 0;
    }

    // --- AVANZAR FRAME DE ANIMACIÓN ---
    const anim = ANIMACIONES[birraman.state];
    const framesPerUpdate = Math.round(60 / anim.fps);
    animTimer++;
    if (animTimer >= framesPerUpdate) {
        animTimer = 0;
        animFrame = (animFrame + 1) % anim.frames.length;
    }
}

// ============================================================
// FUNCIÓN DE DIBUJO (pinta la pantalla 60 veces por segundo)
// ============================================================
function dibujar() {
    // Limpiar la pantalla (borrar el fotograma anterior)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- FONDO DEL NIVEL ---
    // Cielo gradiente (de azul claro arriba a verde prado abajo)
    const gradienteCielo = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradienteCielo.addColorStop(0, '#87CEEB'); // Azul cielo
    gradienteCielo.addColorStop(1, '#C8E6C9'); // Verde claro
    ctx.fillStyle = gradienteCielo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- DIBUJAR LAS PLATAFORMAS ---
    for (const p of plataformas) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        // Borde superior de la plataforma (el césped)
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(p.x, p.y, p.w, 6);
    }

    // --- DIBUJAR A BIRRAMAN ---
    dibujarBirramanSprite(birraman.x, birraman.y, birraman.width, birraman.height);

    // --- INSTRUCCIONES EN PANTALLA ---
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(10, 10, 400, 35);
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText('← → / A D: Mover   ESPACIO / ↑ / W: Saltar   X / Z: Atacar', 18, 32);

    // --- ESTADO DE ANIMACIÓN (debug) ---
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(10, canvas.height - 30, 180, 22);
    ctx.fillStyle = '#FFE066';
    ctx.font = '13px monospace';
    ctx.fillText(`Estado: ${birraman.state}  Frame: ${animFrame}`, 16, canvas.height - 14);
}

// ============================================================
// BIRRAMAN SPRITE - Dibuja el personaje usando el sprite sheet
// pixel art generado. Gestiona el flip horizontal según dirección.
// Si el sprite aún no cargó, dibuja un placeholder colored.
// ============================================================
function dibujarBirramanSprite(x, y, w, h) {
    const anim = ANIMACIONES[birraman.state];
    const frameInfo = anim.frames[animFrame] || anim.frames[0];

    // Ajustamos la escala tras el recorte de los márgenes
    const drawH = h * 1.5;
    const drawW = drawH * (frameInfo.sw / frameInfo.sh);
    const drawX = x + w / 2 - drawW / 2;

    const FOOT_RATIO = 0.73; // Re-calculado para que los pies toquen el suelo con el nuevo recorte
    const drawY = (y + h) - drawH * FOOT_RATIO;

    ctx.save();

    if (spriteLoaded) {
        if (!birraman.facingRight) {
            // Flip horizontal para mirar a la izquierda
            ctx.translate(drawX + drawW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(
                spriteCanvas,
                frameInfo.sx, frameInfo.sy, frameInfo.sw, frameInfo.sh, // fuente
                0, drawY, drawW, drawH                                    // destino (flipeado)
            );
        } else {
            ctx.drawImage(
                spriteCanvas,
                frameInfo.sx, frameInfo.sy, frameInfo.sw, frameInfo.sh, // fuente
                drawX, drawY, drawW, drawH                               // destino
            );
        }
    } else {
        // Placeholder mientras carga el sprite
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText('Cargando...', x + 4, y + h / 2);
    }

    ctx.restore();
}


// ============================================================
// FUNCIÓN LEGADA - Mantenida como referencia del diseño original
// Se puede reactivar cambiando dibujarBirramanSprite → dibujarBirraman
// ============================================================
function dibujarBirraman(x, y, w, h) {
    const cx = x + w / 2;          // centro horizontal
    const bot = y + h;             // suelo

    ctx.save();

    // Helper: rellena + contorno negro de una vez
    function F(color, fn) { ctx.fillStyle=color; ctx.beginPath(); fn(); ctx.fill(); }
    function S(color, lw, fn) { ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.beginPath(); fn(); ctx.stroke(); }
    function FS(fill, stroke, lw, fn) { ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=lw; ctx.beginPath(); fn(); ctx.fill(); ctx.stroke(); }

    // ── MARTILLO-BARRIL (detrás, dibujado primero) ────
    // Mango
    FS('#7B4A20','#111',2,()=>ctx.roundRect(cx-22,bot-90,8,55,3));
    S('#5C3010',1,()=>{ ctx.moveTo(cx-20,bot-88); ctx.lineTo(cx-20,bot-36); });
    // Barril
    FS('#A0714A','#111',2,()=>ctx.roundRect(cx-38,bot-100,30,18,8));
    F('#C08850',()=>ctx.roundRect(cx-37,bot-100,28,6,6));      // brillo
    F('#6B4422',()=>ctx.roundRect(cx-38,bot-86,30,4,2));       // sombra
    FS('#7A9090','#111',1.5,()=>ctx.roundRect(cx-38,bot-95,30,4,2)); // anilla 1
    FS('#7A9090','#111',1.5,()=>ctx.roundRect(cx-38,bot-87,30,4,2)); // anilla 2
    F('#AACCCC',()=>ctx.roundRect(cx-36,bot-94,10,2,1));       // brillo anilla

    // ── TRENZA IZQUIERDA ──────────────────────────────
    FS('#CCCCCC','#111',1.5,()=>ctx.roundRect(cx-30,bot-80,10,35,5));
    for(let i=0;i<5;i++){
        F(i%2===0?'#BBBBBB':'#DDDDDD',()=>ctx.ellipse(cx-25,bot-75+i*7,5,3,0,0,Math.PI*2));
    }
    FS('#FFD700','#111',1.5,()=>ctx.arc(cx-25,bot-45,5,0,Math.PI*2)); // anilla dorada

    // ── BOTAS ─────────────────────────────────────────
    // Bota izquierda
    FS('#1E1208','#111',2,()=>ctx.roundRect(cx-24,bot-18,22,18,[3,3,8,8]));
    F('#3A2820',()=>ctx.roundRect(cx-23,bot-18,10,5,2));       // brillo
    FS('#6688A0','#111',1.5,()=>ctx.ellipse(cx-13,bot-2,10,4,0,0,Math.PI*2)); // puntera
    FS('#FFD700','#333',1,()=>ctx.roundRect(cx-18,bot-10,8,4,2)); // hebilla
    // Bota derecha
    FS('#1E1208','#111',2,()=>ctx.roundRect(cx+2,bot-18,22,18,[3,3,8,8]));
    F('#3A2820',()=>ctx.roundRect(cx+3,bot-18,10,5,2));
    FS('#6688A0','#111',1.5,()=>ctx.ellipse(cx+13,bot-2,10,4,0,0,Math.PI*2));
    FS('#FFD700','#333',1,()=>ctx.roundRect(cx+10,bot-10,8,4,2));

    // ── PIERNAS CORTAS (enano) ────────────────────────
    FS('#3A2010','#111',2,()=>ctx.roundRect(cx-22,bot-36,18,20,[4,4,0,0]));
    F('#4A3020',()=>ctx.roundRect(cx-21,bot-36,6,18,2));       // brillo
    F('#1E0E05',()=>ctx.roundRect(cx-5,bot-36,1,18,0));        // costura
    FS('#3A2010','#111',2,()=>ctx.roundRect(cx+4,bot-36,18,20,[4,4,0,0]));
    F('#4A3020',()=>ctx.roundRect(cx+5,bot-36,6,18,2));
    F('#1E0E05',()=>ctx.roundRect(cx+19,bot-36,1,18,0));

    // ── TORSO LARGO / COTA DE MALLA ──────────────────
    FS('#607D8B','#111',2,()=>ctx.roundRect(cx-22,bot-76,44,42,6));
    F('#7A9BAC',()=>ctx.roundRect(cx-21,bot-75,14,38,4));      // brillo izq
    F('#455A64',()=>ctx.roundRect(cx+8,bot-75,12,38,0));       // sombra der
    // Textura malla
    for(let i=0;i<6;i++) S('rgba(0,0,0,0.18)',1,()=>{ ctx.moveTo(cx-21,bot-72+i*7); ctx.lineTo(cx+21,bot-72+i*7); });

    // ── MANDIL DE CUERO ───────────────────────────────
    ctx.fillStyle='#8B5E1A'; ctx.strokeStyle='#111'; ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.moveTo(cx-16,bot-74); ctx.lineTo(cx+16,bot-74);
    ctx.lineTo(cx+13,bot-38); ctx.lineTo(cx-13,bot-38); ctx.closePath();
    ctx.fill(); ctx.stroke();
    F('#B07E30',()=>{ ctx.moveTo(cx-15,bot-74); ctx.lineTo(cx+15,bot-74); ctx.lineTo(cx+13,bot-68); ctx.lineTo(cx-13,bot-68); ctx.closePath(); }); // brillo
    F('#5A3D0D',()=>{ ctx.moveTo(cx-2,bot-74); ctx.lineTo(cx+2,bot-74); ctx.lineTo(cx+1,bot-38); ctx.lineTo(cx-1,bot-38); ctx.closePath(); }); // sombra central
    // Remaches del mandil
    [[-12,-70],[12,-70],[-10,-52],[10,-52]].forEach(([rx,ry])=>{
        FS('#FFD700','#888',1,()=>ctx.arc(cx+rx,bot+ry,3,0,Math.PI*2));
    });

    // ── CINTURÓN ──────────────────────────────────────
    FS('#2D1C06','#111',2,()=>ctx.roundRect(cx-22,bot-44,44,9,3));
    FS('#FFD700','#555',1.5,()=>ctx.roundRect(cx-8,bot-46,16,12,3)); // hebilla
    S('#888',1,()=>{ ctx.moveTo(cx-3,bot-46); ctx.lineTo(cx-3,bot-34); });
    S('#888',1,()=>{ ctx.moveTo(cx+3,bot-46); ctx.lineTo(cx+3,bot-34); });
    F('#FFF176',()=>ctx.roundRect(cx-7,bot-45,7,5,1)); // brillo hebilla

    // ── EMBLEMA LÚPULO ────────────────────────────────
    FS('#1A6622','#111',1,()=>ctx.arc(cx,bot-60,11,0,Math.PI*2));
    F('#33AA44',()=>ctx.ellipse(cx,bot-64,4,8,0,0,Math.PI*2));
    F('#33AA44',()=>ctx.ellipse(cx-6,bot-61,3,7,-0.6,0,Math.PI*2));
    F('#33AA44',()=>ctx.ellipse(cx+6,bot-61,3,7,0.6,0,Math.PI*2));
    F('#55DD66',()=>ctx.arc(cx,bot-65,2,0,Math.PI*2));

    // ── HOMBROS ───────────────────────────────────────
    FS('#7A9090','#111',2,()=>ctx.arc(cx-20,bot-74,11,Math.PI,Math.PI*2));
    F('#AACCCC',()=>ctx.arc(cx-22,bot-78,4,Math.PI,Math.PI*2)); // brillo
    FS('#7A9090','#111',2,()=>ctx.arc(cx+20,bot-74,11,Math.PI,Math.PI*2));
    F('#AACCCC',()=>ctx.arc(cx+18,bot-78,4,Math.PI,Math.PI*2));
    FS('#FFD700','#888',1,()=>ctx.arc(cx-20,bot-77,3,0,Math.PI*2));
    FS('#FFD700','#888',1,()=>ctx.arc(cx+20,bot-77,3,0,Math.PI*2));

    // ── BRAZO IZQUIERDO (levantado con martillo) ──────
    FS('#607D8B','#111',1.5,()=>ctx.roundRect(cx-30,bot-74,10,28,5));
    F('#7A9BAC',()=>ctx.roundRect(cx-29,bot-73,4,24,3));
    FS('#5A3D0D','#111',1.5,()=>ctx.arc(cx-25,bot-52,9,0,Math.PI*2)); // guante
    F('#7A5020',()=>ctx.arc(cx-27,bot-54,4,0,Math.PI*2));             // brillo guante

    // ── BRAZO DERECHO ─────────────────────────────────
    FS('#607D8B','#111',1.5,()=>ctx.roundRect(cx+20,bot-68,10,24,5));
    F('#7A9BAC',()=>ctx.roundRect(cx+21,bot-67,4,20,3));
    FS('#5A3D0D','#111',1.5,()=>ctx.arc(cx+25,bot-48,8,0,Math.PI*2));
    F('#7A5020',()=>ctx.arc(cx+23,bot-50,3,0,Math.PI*2));

    // ── CUELLO ────────────────────────────────────────
    FS('#FFCC99','#111',1.5,()=>ctx.roundRect(cx-7,bot-80,14,10,3));
    F('#DD9966',()=>ctx.roundRect(cx-6,bot-79,5,8,2));

    // ── CABEZA ────────────────────────────────────────
    // Cara base
    FS('#FFCC99','#111',2.5,()=>ctx.ellipse(cx,bot-98,24,22,0,0,Math.PI*2));
    F('#DD9966',()=>ctx.ellipse(cx+10,bot-96,8,16,0.3,0,Math.PI*2));  // sombra der
    F('#FFE8CC',()=>ctx.ellipse(cx-8,bot-105,10,8,0,0,Math.PI*2));    // brillo frente
    // Mejillas sonrosadas
    F('rgba(220,100,80,0.3)',()=>ctx.ellipse(cx-14,bot-95,8,5,0,0,Math.PI*2));
    F('rgba(220,100,80,0.3)',()=>ctx.ellipse(cx+14,bot-95,8,5,0,0,Math.PI*2));
    // Nariz roja de viejo cervecero
    FS('#CC4444','#111',1.2,()=>ctx.ellipse(cx+7,bot-96,6,5,0.3,0,Math.PI*2));
    F('#EE6666',()=>ctx.arc(cx+5,bot-98,3,0,Math.PI*2));
    // Ojo izquierdo
    FS('#FFF','#111',1.5,()=>ctx.ellipse(cx-9,bot-102,6,5,0,0,Math.PI*2));
    FS('#1A3399','#111',1,()=>ctx.arc(cx-9,bot-102,4,0,Math.PI*2));
    F('#000',()=>ctx.arc(cx-9,bot-102,2.5,0,Math.PI*2));
    F('#FFF',()=>ctx.arc(cx-7,bot-104,1.5,0,Math.PI*2));
    // Ojo derecho
    FS('#FFF','#111',1.5,()=>ctx.ellipse(cx+7,bot-102,6,5,0,0,Math.PI*2));
    FS('#1A3399','#111',1,()=>ctx.arc(cx+7,bot-102,4,0,Math.PI*2));
    F('#000',()=>ctx.arc(cx+7,bot-102,2.5,0,Math.PI*2));
    F('#FFF',()=>ctx.arc(cx+9,bot-104,1.5,0,Math.PI*2));
    // Cejas blancas gruesas
    FS('#EEEEEE','#111',1,()=>ctx.roundRect(cx-17,bot-110,10,4,2));
    FS('#EEEEEE','#111',1,()=>ctx.roundRect(cx+7,bot-110,10,4,2));

    // ── PELO BLANCO ───────────────────────────────────
    FS('#E0E0E0','#111',2,()=>ctx.ellipse(cx,bot-116,24,12,0,Math.PI,Math.PI*2));
    F('#FAFAFA',()=>ctx.ellipse(cx-4,bot-120,14,8,0,Math.PI,Math.PI*2));
    // Mechón lateral derecho
    FS('#DDDDDD','#111',1.5,()=>ctx.roundRect(cx+14,bot-100,10,18,5));
    F('#EEEEEE',()=>ctx.roundRect(cx+15,bot-99,5,14,4));

    // ── BARBA BLANCA ESPUMOSA ─────────────────────────
    // 3 capas para dar volumen (oscuro → medio → claro)
    F('#CCCCCC',()=>ctx.ellipse(cx,bot-86,22,14,0,0,Math.PI*2));
    F('#CCCCCC',()=>ctx.ellipse(cx-16,bot-90,10,12,0,0,Math.PI*2));
    F('#CCCCCC',()=>ctx.ellipse(cx+16,bot-90,10,12,0,0,Math.PI*2));
    F('#E8E8E8',()=>ctx.ellipse(cx,bot-89,20,12,0,0,Math.PI*2));
    F('#E8E8E8',()=>ctx.ellipse(cx-13,bot-92,9,10,0,0,Math.PI*2));
    F('#E8E8E8',()=>ctx.ellipse(cx+13,bot-92,9,10,0,0,Math.PI*2));
    F('#FAFAFA',()=>ctx.ellipse(cx,bot-91,18,11,0,0,Math.PI*2));
    F('#FAFAFA',()=>ctx.ellipse(cx-10,bot-94,8,9,0,0,Math.PI*2));
    F('#FAFAFA',()=>ctx.ellipse(cx+10,bot-94,8,9,0,0,Math.PI*2));
    F('#FAFAFA',()=>ctx.ellipse(cx-4,bot-84,7,8,0,0,Math.PI*2));
    F('#FAFAFA',()=>ctx.ellipse(cx+4,bot-84,7,8,0,0,Math.PI*2));
    // Brillos de espuma
    F('rgba(255,255,255,0.9)',()=>ctx.ellipse(cx-8,bot-94,5,4,0,0,Math.PI*2));
    F('rgba(255,255,255,0.9)',()=>ctx.ellipse(cx+3,bot-92,4,3,0,0,Math.PI*2));
    // Contorno de la barba
    S('#CCCCCC',1.5,()=>ctx.arc(cx,bot-89,20,0.4,Math.PI-0.4));

    // ── ESPIGA DE CEBADA ──────────────────────────────
    ctx.save();
    ctx.translate(cx+10, bot-97);
    ctx.rotate(-0.2);
    S('#FFCC22',2.5,()=>{ ctx.moveTo(0,0); ctx.lineTo(24,0); });
    for(let i=0;i<5;i++){
        FS('#FFDD33','#AA7700',0.8,()=>ctx.ellipse(4+i*4.5,-3.5,4,2.5,-0.3,0,Math.PI*2));
        FS('#FFDD33','#AA7700',0.8,()=>ctx.ellipse(4+i*4.5,3.5,4,2.5,0.3,0,Math.PI*2));
        F('#FFF176',()=>ctx.arc(3+i*4.5,-4,1.5,0,Math.PI*2));
    }
    ctx.restore();

    ctx.restore();
}
function bucleDeJuego() {
    actualizar(); // 1. Actualiza la física y los controles
    dibujar();    // 2. Dibuja todo en la pantalla
    requestAnimationFrame(bucleDeJuego); // 3. Se vuelve a llamar a sí misma
}

// ¡Arrancar el juego!
bucleDeJuego();
