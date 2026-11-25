class TerrenoIsometrico {
    constructor(caneta) {
        this.algoritmo = new Algoritmo();
        this.caneta = caneta;

        // Parâmetros de ajuste do terreno
        this.amplitude = 40;
        this.frequencia = 0.15;
        this.algoritmoTerreno = 0;
        this.velocidade = 0.03;

        // Câmera 3D (valores iniciais = vista isométrica original)
        this.yaw = Math.PI / 4;
        this.pitch = Math.atan(1 / Math.SQRT2);
        this.pitchMin = 0.45;
        this.pitchMax = 1.5;

        // Geometria
        this.tamanhoTile = 23.57;   // maior = menos tiles na tela = mais rápido
        this.escalaAltura = 1.2;
        this.corLadoRGB = [120, 90, 60];
        this.corFundo = "#1d2a18";

        // Mundo infinito: a câmera segue o personagem (coordenadas de grade)
        this.camX = 0;
        this.camY = 0;
        this.camZ = 0;
        this.camIniciada = false;

        // Efeito de geração
        this.tiles = new Map();      // chave do tile -> { nasc, visto }
        this.quadro = 0;
        this.duracaoGeracao = 45;
        this.ondaInicial = true;
        this.raioSemGeracao = 12;    // tiles até esta distância da câmera já nascem prontos (sem efeito)

        // Zoom: o centro da tela (onde fica o personagem) é o ponto fixo
        this.zoom = 1;          // valor atual (suavizado)
        this.zoomAlvo = 1;      // valor pedido pelo slider

        this.tempo = 0;
        this.personagem = null;

        // --- estruturas reaproveitadas entre frames (evita lixo para o GC) ---
        this.NX = [0, 1, 0, -1];     // normais das 4 faces laterais
        this.NY = [-1, 0, 1, 0];
        this.bufAlt = new Float32Array(0);
        this.rowMin = new Int32Array(0);
        this.rowMax = new Int32Array(0);

        // paletas pré-calculadas (256 cores por paleta, indexadas pela altura relativa)
        this.paletas = {};
        for (const nome in Algoritmo.paletas) {
            this.paletas[nome] = this.criarPaleta(Algoritmo.paletas[nome]);
        }
        this.bufCor = new Uint8Array(0);        // índice de cor de cada tile no frame

        // Obstáculos (decididos quando o tile nasce e guardados no registro dele)
        this.obstaculos = new Obstaculos();
        this.obstaculosAtivos = true;
        this.bufObs = [];                       // obstáculo de cada tile no frame (ou null)
        this.bufEsc = new Float32Array(0);      // quanto o tile já cresceu (0..1)

        // Itens no chão e entidades (personagem, NPCs, flechas...)
        this.jogo = null;
        this.vista = {};                        // câmera do último frame (para converter cliques)
        this.itensAtivos = true;                // liga/desliga os itens no chão
        this.coletados = new Set();             // tiles de onde um item já foi pego
        this.bufItem = [];
        this.bufEnt = new Uint8Array(0);
        this.entMap = new Map();

        // --- objetos reaproveitados a cada frame (zero alocação no desenhar) ---
        this._r1 = [0, 0];
        this._r2 = [0, 0];
        this._ox = new Float64Array(4);
        this._oy = new Float64Array(4);
        this._facesVis = new Int8Array(4);
        this._corLado = ["", "", "", ""];
        this._yawLado = NaN;
        this._poolListas = [];
        this._viz = new Int32Array(4);

        // --- descarte de tiles (culling) ---
        this.bufVis = new Uint8Array(0);        // 1 = o tile precisa ser desenhado neste frame
        this.hor = new Float32Array(0);         // "horizonte": y a partir do qual a tela já está coberta, por coluna
        this._perfil = new Float32Array(128);   // borda superior do tile (y por x), igual para todos os tiles
        this.margemObstaculo = 70;              // altura máxima (px) de árvore/pedra acima do tile — ajuste se tiver obstáculos mais altos
        this.culling = true;                    // liga/desliga o descarte de tiles escondidos

        // cache de alturas válido só dentro do frame (colisão/NPCs consultam os mesmos tiles várias vezes)
        this._cI = new Int32Array(4096);
        this._cJ = new Int32Array(4096);
        this._cQ = new Int32Array(4096).fill(-1);
        this._cV = new Float64Array(4096);
        this._entUnico = [null];
        this._fps = { t: performance.now(), frames: 0, valor: 60, ms: "0.0", texto: "FPS: 60 (0.0ms)" };
    }

    alturaRelativa(i, j) {
        return this.amplitude > 0 ? this.alturaBruta(i, j) / (this.amplitude * 2) : 0;
    }

    itemEm(i, j) {
        if (!this.itensAtivos) return null;
        const info = this.tiles.get(this.chave(i, j));
        return info ? info.item || null : null;
    }

    removerItem(i, j) {
        const k = this.chave(i, j);
        const info = this.tiles.get(k);
        if (info) info.item = null;
        this.coletados.add(k);   // não volta a nascer quando o tile for recriado
    }

    colocarItem(i, j, tipo) {
        if (!this.itensAtivos) return false;
        const info = this.tiles.get(this.chave(i, j));
        if (!info || info.item || info.obst) return false;
        info.item = tipo;
        return true;
    }

    // Sorteio de item ao nascer o tile (~0,8% dos tiles): 35% armas, 65% comidas
    decidirItem(i, j, f) {
        if (this.coletados.has(this.chave(i, j))) return null;
        if (Itens.iniciais[i + "," + j]) return Itens.iniciais[i + "," + j];
        if (f < 0.012) return null;
        const alg = this.algoritmo;
        if (alg.hash2(i, j, 31) > 0.008) return null;
        const h = alg.hash2(i, j, 32);
        return Itens.sortear(h);
    }

    // O tile (i, j) tem um obstáculo que bloqueia a passagem?
    temObstaculo(i, j) {
        if (!this.obstaculosAtivos) return false;
        const info = this.tiles.get(this.chave(i, j));
        return !!(info && info.obst);
    }

    // paradas: [[altura relativa 0..1, [r, g, b]], ...]  ->  256 cores "rgb(...)"
    criarPaleta(paradas) {
        const pal = [];
        for (let n = 0; n < 256; n++) {
            const f = n / 255;
            let c = paradas[paradas.length - 1][1];
            if (f <= paradas[0][0]) {
                c = paradas[0][1];
            } else {
                for (let k = 0; k < paradas.length - 1; k++) {
                    const [f0, c0] = paradas[k], [f1, c1] = paradas[k + 1];
                    if (f >= f0 && f < f1) {
                        const u = (f - f0) / (f1 - f0);
                        c = [Math.round(c0[0] + (c1[0] - c0[0]) * u), Math.round(c0[1] + (c1[1] - c0[1]) * u), Math.round(c0[2] + (c1[2] - c0[2]) * u)];
                        break;
                    }
                }
            }
            pal.push(`rgb(${c[0]},${c[1]},${c[2]})`);
        }
        return pal;
    }

    // Chave inteira de 30 bits (cabe em um Smi do V8: hash de Map/Set bem mais rápido que com doubles).
    // Cobre i, j em [-16384, 16383].
    chave(i, j) {
        return (i + 16384) * 32768 + (j + 16384);
    }

    // Altura "pura" do terreno em (i, j) — i e j podem ser negativos
    alturaBruta(i, j) {
        const h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) & 4095;
        if (this._cQ[h] === this.quadro && this._cI[h] === i && this._cJ[h] === j) return this._cV[h];
        const v0 = this.algoritmo.altura(
            i, j, this.algoritmoTerreno, this.frequencia, this.tempo, this.amplitude
        );
        const v = v0 > 0 ? v0 : 0; // negativos e NaN viram 0
        this._cQ[h] = this.quadro; this._cI[h] = i; this._cJ[h] = j; this._cV[h] = v;
        return v;
    }

    _invalidarAlturas() { this._cQ.fill(-1); }

    // 0..1: quanto o tile já cresceu (sem registro = tile "antigo", já crescido)
    crescimento(info) {
        if (!info) return 1;
        const p = (this.quadro - info.nasc) / this.duracaoGeracao;
        if (p <= 0) return 0;
        if (p >= 1) return 1;
        const q = 1 - p;
        return 1 - q * q * q; // easeOutCubic
    }

    // Altura (z do mundo) do tile (i, j) neste frame — usada na colisão
    alturaTile(i, j) {
        return this.alturaBruta(i, j) * this.escalaAltura;
    }

    // Altura de um tile fora da área calculada no frame (só nas bordas)
    alturaBorda(i, j) {
        const info = this.tiles.get(this.chave(i, j));
        if (!info) return 0;
        const e = this.crescimento(info);
        return e === 0 ? 0 : this.alturaBruta(i, j) * e * this.escalaAltura;
    }

    rotacionar(dYaw, dPitch) {
        this.yaw = (this.yaw + dYaw) % (Math.PI * 2);
        this.pitch = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch + dPitch));
    }

    resetarVista() {
        this.yaw = Math.PI / 4;
        this.pitch = Math.atan(1 / Math.SQRT2);
    }

    // restrição linear  lo <= c + a*t <= hi  ->  intervalo de t em out[0..1]
    static intervalo(a, c, lo, hi, out) {
        if (Math.abs(a) < 1e-9) {
            if (c < lo || c > hi) { out[0] = 1; out[1] = 0; }
            else { out[0] = -Infinity; out[1] = Infinity; }
            return;
        }
        let t1 = (lo - c) / a, t2 = (hi - c) / a;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        out[0] = t1; out[1] = t2;
    }

    desenhar() {
        const ctx = this.caneta;
        this._cQ.fill(-1);
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.corFundo;
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        const cy = H / 2 + 20;

        // zoom suave até o valor do slider, ao redor do centro (o personagem, se existir)
        this.zoom += (this.zoomAlvo - this.zoom) * 0.15;
        if (Math.abs(this.zoomAlvo - this.zoom) < 0.001) this.zoom = this.zoomAlvo;
        const zoom = this.zoom;

        // parte do mundo que aparece na tela, em coordenadas "sem zoom"
        const vx0 = cx - cx / zoom, vx1 = cx + (W - cx) / zoom;
        const vy0 = cy - cy / zoom, vy1 = cy + (H - cy) / zoom;
        ctx.setTransform(zoom, 0, 0, zoom, cx * (1 - zoom), cy * (1 - zoom));
        const cosA = Math.cos(this.yaw), sinA = Math.sin(this.yaw);
        const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
        const s = this.tamanhoTile;
        const meio = s / 2;
        const esc = this.escalaAltura;

        // ---- 1) personagem e câmera ----
        const p = this.personagem;
        if (p) {
            p.atualizar(this, this.yaw);
            if (!this.camIniciada) {
                this.camX = p.gx; this.camY = p.gy; this.camZ = p.z;
                this.camIniciada = true;
            } else {
                this.camX += (p.gx - this.camX) * 0.12;
                this.camY += (p.gy - this.camY) * 0.12;
                this.camZ += (p.z - this.camZ) * 0.10;
            }
        }
        if (this.jogo) {                    // NPCs, combate e itens (só com o personagem ligado)
            this.jogo.ativo = !!p;
            if (p) this.jogo.atualizar(this);
            else this.jogo.limpar();
        }
        const camX = this.camX, camY = this.camY, camZ = this.camZ;
        const vista = this.vista;
        vista.cx = cx; vista.cy = cy; vista.zoom = zoom; vista.s = s;
        vista.camX = camX; vista.camY = camY; vista.camZ = camZ;
        vista.cosA = cosA; vista.sinA = sinA; vista.cosP = cosP; vista.sinP = sinP;

        // ---- 2) caixa de tiles que cobre a tela ----
        const marg = s * 2;
        const margemAltura = 70 + this.amplitude * esc * 1.2; // inclui a altura dos obstáculos
        const xLo = vx0 - marg, xHi = vx1 + marg;
        const yLo = vy0 - marg, yHi = vy1 + marg + margemAltura;

        let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
        for (let a = 0; a < 4; a++) {
            const ux = (a & 1 ? xHi : xLo) - cx;
            const uy = (a & 2 ? yHi : yLo) - cy;
            const y1 = (uy - camZ * cosP) / sinP;
            const gi = camX + (ux * cosA + y1 * sinA) / s;
            const gj = camY + (-ux * sinA + y1 * cosA) / s;
            if (gi < minI) minI = gi;
            if (gi > maxI) maxI = gi;
            if (gj < minJ) minJ = gj;
            if (gj > maxJ) maxJ = gj;
        }
        const i0 = Math.floor(minI), i1 = Math.ceil(maxI);
        const j0 = Math.floor(minJ), j1 = Math.ceil(maxJ);
        const nI = i1 - i0 + 3, nJ = j1 - j0 + 3;   // +1 de borda para os vizinhos
        const nLin = i1 - i0 + 1;

        const tam = nI * nJ;
        if (this.bufAlt.length < tam) {
            this.bufAlt = new Float32Array((tam * 1.3) | 0);
            this.bufCor = new Uint8Array(this.bufAlt.length);
            this.bufEsc = new Float32Array(this.bufAlt.length);
            this.bufObs = new Array(this.bufAlt.length).fill(null);
            this.bufItem = new Array(this.bufAlt.length).fill(null);
            this.bufEnt = new Uint8Array(this.bufAlt.length);
            this.bufVis = new Uint8Array(this.bufAlt.length);
        }
        if (this.rowMin.length < nLin) {
            this.rowMin = new Int32Array(nLin * 2);
            this.rowMax = new Int32Array(nLin * 2);
        }
        const alt = this.bufAlt;
        const cores = this.bufCor;
        const obsBuf = this.bufObs, escBuf = this.bufEsc;
        alt.fill(NaN, 0, tam);
        obsBuf.fill(null, 0, tam);
        const itemBuf = this.bufItem, entBuf = this.bufEnt;
        itemBuf.fill(null, 0, tam);
        entBuf.fill(0, 0, tam);

        // paleta do terreno atual
        const tipoInfo = Algoritmo.tipos[this.algoritmoTerreno] || Algoritmo.tipos[0];
        const paletaAtiva = this.paletas[tipoInfo.paleta];
        const invPal = this.amplitude > 0 ? 255 / (this.amplitude * 2) : 0;
        // quando tipo de terreno, frequência ou o switch mudam, os obstáculos são sorteados de novo
        const sig = this.algoritmoTerreno * 100000 + Math.round(this.frequencia * 100)
            + (this.obstaculosAtivos ? 0 : 1e9);
        const rowMin = this.rowMin, rowMax = this.rowMax;

        // ---- 3) alturas (uma passada) + geração dos tiles ----
        // Em cada linha i só entram os j realmente visíveis (faixa exata, não a caixa inteira)
        const a1 = -sinA, a2 = cosA * sinP;
        const c2base = cy + camZ * cosP;
        const r1 = this._r1, r2 = this._r2;
        const tiles = this.tiles;
        const quadro = this.quadro;
        const alg = this.algoritmo;
        const algTipo = this.algoritmoTerreno, freq = this.frequencia;
        const tempo = this.tempo, amp = this.amplitude;
        const dur = this.duracaoGeracao, raioSG = this.raioSemGeracao;
        const onda = this.ondaInicial;
        const obsAtivos = this.obstaculosAtivos, itensAtivos = this.itensAtivos;
        const nomePaleta = tipoInfo.paleta;
        const refX = p ? p.gx : camX;
        const refY = p ? p.gy : camY;
        let maxZ = 0;

        for (let i = i0; i <= i1; i++) {
            const r = i - i0;
            const dx = (i - camX) * s;
            TerrenoIsometrico.intervalo(a1, cx + dx * cosA, xLo, xHi, r1);
            TerrenoIsometrico.intervalo(a2, c2base + dx * sinA * sinP, yLo, yHi, r2);
            const lo = r1[0] > r2[0] ? r1[0] : r2[0];
            const hi = r1[1] < r2[1] ? r1[1] : r2[1];
            if (lo > hi) { rowMin[r] = 1; rowMax[r] = 0; continue; }

            const jMin = Math.max(j0, Math.ceil(camY + lo / s));
            const jMax = Math.min(j1, Math.floor(camY + hi / s));
            rowMin[r] = jMin; rowMax[r] = jMax;

            const base = (i - i0 + 1) * nJ - j0 + 1;
            const rowKey = (i + 16384) * 32768 + 16384;
            const dxCos = cx + dx * cosA;
            const dxSin = dx * sinA;

            for (let j = jMin; j <= jMax; j++) {
                const k = rowKey + j;
                let info = tiles.get(k);

                if (info === undefined) {
                    const dy = (j - camY) * s;
                    const sx = dxCos - dy * sinA;
                    const syB = c2base + (dxSin + dy * cosA) * sinP;

                    // caixa estendida (xLo..xHi, yLo..yHi): gera antes de entrar na tela
                    if (sx >= xLo && sx <= xHi && syB >= yLo && syB <= yHi) {
                        const ddi = i - refX, ddj = j - refY;
                        const dist = Math.sqrt(ddi * ddi + ddj * ddj);
                        const nasc = dist < raioSG
                            ? quadro - dur
                            : quadro + (onda ? (dist - raioSG) * 2 : 0);
                        // todos os campos já na criação -> mesma "forma" de objeto (JIT mais rápido)
                        info = { nasc, visto: quadro, sig: -1, obst: null, item: undefined };
                        tiles.set(k, info);
                    }
                }

                const pos = base + j;
                if (info !== undefined) {
                    info.visto = quadro;
                    let bruta = alg.altura(i, j, algTipo, freq, tempo, amp);
                    if (!(bruta > 0)) bruta = 0;           // negativos e NaN viram 0

                    // easeOutCubic inline
                    const pr = (quadro - info.nasc) / dur;
                    let e;
                    if (pr >= 1) e = 1;
                    else if (pr <= 0) e = 0;
                    else { const q = 1 - pr; e = 1 - q * q * q; }

                    const zz = bruta * e * esc;
                    alt[pos] = zz;
                    if (zz > maxZ) maxZ = zz;
                    const ci = (bruta * invPal) | 0;
                    cores[pos] = ci > 255 ? 255 : ci;

                    if (info.sig !== sig) {
                        info.sig = sig;
                        info.obst = obsAtivos
                            ? this.decidirObstaculo(i, j, bruta * invPal / 255, nomePaleta)
                            : null;
                    }
                    const ob = info.obst;
                    if (ob) { obsBuf[pos] = ob; escBuf[pos] = e; }

                    if (info.item === undefined) {   // itens: sorteados uma vez, quando o tile nasce
                        info.item = ob ? null : this.decidirItem(i, j, bruta * invPal / 255);
                    }
                    const it = info.item;
                    if (it && itensAtivos) { itemBuf[pos] = it; escBuf[pos] = e; }
                } else {
                    alt[pos] = 0; // ainda não nasceu: chão plano
                    cores[pos] = 0;
                }
            }
        }
        this.ondaInicial = false;

        // ---- Entidades agrupadas pelo tile mais frontal da pegada (evita cortes nos pés/corpo) ----
        const entMap = this.entMap;
        entMap.clear();
        let ents;
        if (this.jogo) ents = this.jogo.entidades();
        else if (p) { this._entUnico[0] = p; this._entUnico.length = 1; ents = this._entUnico; }
        else ents = this._entUnico, ents.length = 0;
        const dirFrontI = sinA >= 0 ? 1 : -1;
        const dirFrontJ = cosA >= 0 ? 1 : -1;
        const pool = this._poolListas;
        let poolUsados = 0;

        for (let idxE = 0; idxE < ents.length; idxE++) {
            const e = ents[idxE];
            // referência de profundidade na borda frontal da entidade (evita cortes nos pés/corpo)
            const margemProf = (e.raio || 0.25) + 0.18;
            const ri0 = Math.round(e.gx), rj0 = Math.round(e.gy);
            let ei = Math.round(e.gx + dirFrontI * margemProf);
            let ej = Math.round(e.gy + dirFrontJ * margemProf);

            // não ultrapassa para um tile frontal bem mais alto (evita aparecer através de paredes)
            if (ei !== ri0 || ej !== rj0) {
                if (this.alturaTile(ei, ej) > this.alturaTile(ri0, rj0) + 4) { ei = ri0; ej = rj0; }
            }

            if (ei < i0 || ei > i1) continue;
            const er = ei - i0;
            if (ej < rowMin[er] || ej > rowMax[er]) continue;
            const eidx = (ei - i0 + 1) * nJ + (ej - j0 + 1);
            entBuf[eidx] = 1;
            const lista = entMap.get(eidx);
            if (lista) lista.push(e);
            else {
                const nova = pool[poolUsados] || (pool[poolUsados] = []);
                poolUsados++;
                nova.length = 0;
                nova.push(e);
                entMap.set(eidx, nova);
            }
        }
        const cmpProf = (a, b) => (a.gx * sinA + a.gy * cosA) - (b.gx * sinA + b.gy * cosA);

        // ---- 4) valores constantes do frame, iguais para todos os tiles ----
        // deslocamento na tela de cada canto do tile (ligeiramente maior p/ cobrir frestas)
        const E = 1.04;
        const ox = this._ox, oy = this._oy;
        for (let k = 0; k < 4; k++) {
            const cdx = (k === 1 || k === 2) ? meio : -meio;
            const cdy = k >= 2 ? meio : -meio;
            ox[k] = (cdx * cosA - cdy * sinA) * E;
            oy[k] = (cdx * sinA + cdy * cosA) * sinP * E;
        }
        const ox0 = ox[0], ox1 = ox[1], ox2 = ox[2], ox3 = ox[3];
        const oy0 = oy[0], oy1 = oy[1], oy2 = oy[2], oy3 = oy[3];
        const minOx = Math.min(ox0, ox1, ox2, ox3), maxOx = Math.max(ox0, ox1, ox2, ox3);
        const minOy = Math.min(oy0, oy1, oy2, oy3), maxOy = Math.max(oy0, oy1, oy2, oy3);

        // faces laterais: só as que olham para a câmera (back-face culling); cor só depende do yaw
        const NX = this.NX, NY = this.NY;
        const facesVis = this._facesVis;
        let nVis = 0;
        for (let k = 0; k < 4; k++) {
            if (NX[k] * sinA + NY[k] * cosA > 1e-6) facesVis[nVis++] = k;
        }
        const corLado = this._corLado;
        if (this._yawLado !== this.yaw) {
            this._yawLado = this.yaw;
            const [lr, lg, lb] = this.corLadoRGB;
            for (let k = 0; k < 4; k++) {
                const n1x = NX[k] * cosA - NY[k] * sinA;
                const f = 1 - Math.max(0, Math.min(0.4, 0.12 + 0.13 * n1x));
                corLado[k] = `rgb(${(lr * f) | 0},${(lg * f) | 0},${(lb * f) | 0})`;
            }
        }
        const viz = this._viz;       // deslocamento no buffer até o vizinho de cada face
        viz[0] = -1; viz[1] = nJ; viz[2] = 1; viz[3] = -nJ;

        const jogo = this.jogo;
        const itemPerto = jogo ? jogo.itemPerto : null;
        const obstaculos = this.obstaculos;
        const iAsc = sinA >= 0, jAsc = cosA >= 0;
        const dirJ = jAsc ? 1 : -1;
        const dSx = -s * sinA * dirJ, dSy = s * cosA * sinP * dirJ;   // passo na tela ao andar 1 tile em j

        // ---- 4b) pré-passagem FRENTE -> TRÁS: decide quais tiles realmente aparecem ----
        // (a) fora da tela  (b) totalmente escondidos atrás de tiles mais próximos e mais altos.
        // O "horizonte" guarda, por coluna de pixels, o y a partir do qual a tela já está coberta.
        const vis = this.bufVis;
        vis.fill(0, 0, tam);
        const margemObs = this.margemObstaculo;
        const cullX0 = vx0 - 48, cullX1 = vx1 + 48;
        const bw = 6;                                   // largura da coluna do horizonte (px)
        const bx0 = vx0 - 64;
        const nb = Math.ceil((vx1 - vx0 + 128) / bw) + 1;
        // só vale a pena se o relevo é alto o bastante para esconder algum tile
        const usarHor = this.culling && maxZ * cosP > s * sinP * 0.35;
        let tOff = 0;
        if (usarHor) {
            if (this.hor.length < nb) this.hor = new Float32Array(nb * 2);
            this.hor.fill(Infinity, 0, nb);
            // borda superior do tile (y em função de x), em passos de 1px; igual para todos os tiles
            tOff = Math.floor(minOx) - 1;
            const tN = Math.ceil(maxOx) - tOff + 2;
            if (this._perfil.length < tN) this._perfil = new Float32Array(tN * 2);
            const Tp = this._perfil;
            for (let d = 0; d < tN; d++) {
                const x = tOff + d;
                let y = Infinity;
                for (let k = 0; k < 4; k++) {
                    const k2 = (k + 1) & 3;
                    const xa = ox[k], xb = ox[k2], ya = oy[k], yb = oy[k2];
                    const lo = xa < xb ? xa : xb, hi = xa < xb ? xb : xa;
                    if (x < lo || x > hi) continue;
                    const yy = hi - lo < 1e-9 ? (ya < yb ? ya : yb) : ya + (yb - ya) * (x - xa) / (xb - xa);
                    if (yy < y) y = yy;
                }
                Tp[d] = y;
            }
        }
        const hor = this.hor, T = this._perfil;

        for (let ri = nLin - 1; ri >= 0; ri--) {
            const i = iAsc ? i0 + ri : i1 - ri;
            const r = i - i0;
            const jMin = rowMin[r], jMax = rowMax[r];
            if (jMin > jMax) continue;

            const dx = (i - camX) * s;
            const base = (i - i0 + 1) * nJ - j0 + 1;
            const nCols = jMax - jMin + 1;
            const jIni = jAsc ? jMin : jMax;
            const dy0 = (jIni - camY) * s;
            const sxRow = cx + dx * cosA - dy0 * sinA;
            const syRow = c2base + (dx * sinA + dy0 * cosA) * sinP;

            for (let rj = nCols - 1; rj >= 0; rj--) {
                const sx = sxRow + rj * dSx;
                if (sx < cullX0 || sx > cullX1) continue;                 // fora da tela (lados)
                const idx = base + jIni + rj * dirJ;
                const syBase = syRow + rj * dSy;
                if (syBase + maxOy < vy0) continue;                       // tile todo acima da tela

                const syTopo = syBase - alt[idx] * cosP;
                const te = entBuf[idx];
                // folga acima do tile: entidades, obstáculos e itens "crescem" para cima
                const extra = te !== 0 ? 70 : obsBuf[idx] !== null ? margemObs : itemBuf[idx] !== null ? 14 : 0;
                const topY = syTopo + minOy - extra;
                if (topY > vy1) continue;                                 // tile todo abaixo da tela

                if (usarHor) {
                    const bl = Math.floor((sx + minOx - bx0) / bw);
                    const br = Math.floor((sx + maxOx - bx0) / bw);
                    if (te === 0 && bl >= 0 && br < nb) {
                        let escondido = true;
                        for (let q = bl; q <= br; q++) {
                            if (topY < hor[q]) { escondido = false; break; }
                        }
                        if (escondido) continue;                          // coberto por tiles mais próximos
                    }
                    // este tile cobre da sua borda superior para baixo: atualiza o horizonte
                    // (só nas colunas inteiramente dentro dele; ali vale o maior y das duas pontas)
                    const q0 = Math.max(0, Math.ceil((sx + minOx - bx0) / bw));
                    const q1 = Math.min(nb - 1, Math.floor((sx + maxOx - bx0) / bw) - 1);
                    for (let q = q0; q <= q1; q++) {
                        const xl = bx0 + q * bw - sx;
                        const fl = Math.floor(xl) - tOff, fr = Math.floor(xl + bw) - tOff;
                        let m = T[fl] > T[fl + 1] ? T[fl] : T[fl + 1];
                        const m2 = T[fr] > T[fr + 1] ? T[fr] : T[fr + 1];
                        if (m2 > m) m = m2;
                        const cob = syTopo + m;
                        if (cob < hor[q]) hor[q] = cob;
                    }
                }
                vis[idx] = 1;
            }
        }

        // Cor atual do contexto: 0..255 = paleta, 256..259 = faces laterais, -1 = desconhecida.
        // Polígonos consecutivos de mesma cor entram num único path (um só fill()).
        let corAtual = -1;
        let aberto = false;

        // ---- 5) desenho de trás para frente, SEM ordenar, só o que está visível ----
        for (let ri = 0; ri < nLin; ri++) {
            const i = iAsc ? i0 + ri : i1 - ri;
            const r = i - i0;
            const jMin = rowMin[r], jMax = rowMax[r];
            if (jMin > jMax) continue;

            const dx = (i - camX) * s;
            const base = (i - i0 + 1) * nJ - j0 + 1;
            const nCols = jMax - jMin + 1;
            const jIni = jAsc ? jMin : jMax;
            const dy0 = (jIni - camY) * s;
            const sxRow = cx + dx * cosA - dy0 * sinA;
            const syRow = c2base + (dx * sinA + dy0 * cosA) * sinP;

            let rj = 0;
            while (rj < nCols) {
                const rjAtual = rj++;
                const idx = base + jIni + rjAtual * dirJ;
                if (vis[idx] === 0) continue;

                const sx = sxRow + rjAtual * dSx;
                const syBase = syRow + rjAtual * dSy;
                const z = alt[idx];
                const syTopo = syBase - z * cosP;
                const cid = cores[idx];
                const ob = obsBuf[idx];
                const item = itemBuf[idx];
                const temEnt = entBuf[idx];

                // ---- chão plano (sem lados, obstáculo, item ou entidade): funde a sequência
                //      de tiles iguais da linha num único paralelogramo ----
                if (z <= 0.5 && ob === null && item === null && temEnt === 0) {
                    let fim = rjAtual;
                    while (fim + 1 < nCols) {
                        const i2 = idx + (fim + 1 - rjAtual) * dirJ;
                        if (vis[i2] === 0 || alt[i2] > 0.5 || cores[i2] !== cid ||
                            obsBuf[i2] !== null || itemBuf[i2] !== null || entBuf[i2] !== 0) break;
                        fim++;
                    }
                    const n = fim - rjAtual;
                    const sxF = sx + n * dSx;
                    const syF = syRow + fim * dSy - alt[idx + n * dirJ] * cosP;
                    rj = fim + 1;

                    if (cid !== corAtual) {
                        if (aberto) { ctx.fill(); aberto = false; }
                        ctx.fillStyle = paletaAtiva[cid]; corAtual = cid;
                    }
                    if (!aberto) { ctx.beginPath(); aberto = true; }
                    // L = tile de menor j, H = tile de maior j
                    const sxL = jAsc ? sx : sxF, syL = jAsc ? syTopo : syF;
                    const sxH = jAsc ? sxF : sx, syH = jAsc ? syF : syTopo;
                    ctx.moveTo(sxL + ox0, syL + oy0);
                    ctx.lineTo(sxL + ox1, syL + oy1);
                    ctx.lineTo(sxH + ox2, syH + oy2);
                    ctx.lineTo(sxH + ox3, syH + oy3);
                    continue;
                }

                // faces laterais: só as voltadas para a câmera e só o trecho acima do vizinho
                if (z > 0.5) {
                    for (let q = 0; q < nVis; q++) {
                        const k = facesVis[q];
                        let hn = alt[idx + viz[k]];
                        if (hn !== hn) hn = this.alturaBorda(i + NX[k], jIni + rjAtual * dirJ + NY[k]); // NaN
                        if (z - hn < 0.5) continue;

                        const k2 = (k + 1) & 3;
                        const syB = syBase - hn * cosP;
                        const id = 256 + k;
                        if (id !== corAtual) {
                            if (aberto) { ctx.fill(); aberto = false; }
                            ctx.fillStyle = corLado[k]; corAtual = id;
                        }
                        if (!aberto) { ctx.beginPath(); aberto = true; }
                        ctx.moveTo(sx + ox[k], syTopo + oy[k]);
                        ctx.lineTo(sx + ox[k2], syTopo + oy[k2]);
                        ctx.lineTo(sx + ox[k2], syB + oy[k2]);
                        ctx.lineTo(sx + ox[k], syB + oy[k]);
                    }
                }

                // topo
                if (cid !== corAtual) {
                    if (aberto) { ctx.fill(); aberto = false; }
                    ctx.fillStyle = paletaAtiva[cid]; corAtual = cid;
                }
                if (!aberto) { ctx.beginPath(); aberto = true; }
                ctx.moveTo(sx + ox0, syTopo + oy0);
                ctx.lineTo(sx + ox1, syTopo + oy1);
                ctx.lineTo(sx + ox2, syTopo + oy2);
                ctx.lineTo(sx + ox3, syTopo + oy3);

                if (ob === null && item === null && temEnt === 0) continue;

                // daqui em diante o código externo desenha: fecha o path em aberto
                if (aberto) { ctx.fill(); aberto = false; }
                const j = jIni + rjAtual * dirJ;

                // obstáculo (árvore, pedra...): logo depois do tile, antes dos mais próximos
                if (ob && escBuf[idx] > 0.04) {
                    const obx = ob.ox * s, oby = ob.oy * s;
                    obstaculos.desenhar(
                        ctx, ob,
                        sx + obx * cosA - oby * sinA,
                        syTopo + (obx * sinA + oby * cosA) * sinP,
                        escBuf[idx]
                    );
                    corAtual = -1;
                }

                // item no chão
                if (item && escBuf[idx] > 0.2) {
                    const perto = itemPerto && itemPerto.i === i && itemPerto.j === j;
                    Itens.desenharChao(ctx, item, sx, syTopo, quadro, perto);
                    corAtual = -1; // o item troca o fillStyle (brilho e sombra)
                }

                // entidades neste tile (personagem, NPCs, flechas...): logo depois dele
                if (temEnt) {
                    const lista = entMap.get(idx);
                    if (lista.length > 1) lista.sort(cmpProf);
                    for (let q = 0; q < lista.length; q++) {
                        const e = lista[q];
                        const edx = (e.gx - camX) * s, edy = (e.gy - camY) * s;
                        e.desenharEm(
                            cx + edx * cosA - edy * sinA,
                            cy + (edx * sinA + edy * cosA) * sinP - (e.z - camZ) * cosP,
                            sinP, cosP, cosA, sinA
                        );
                    }
                    corAtual = -1; // as entidades mexem no estado do contexto
                }
            }
        }
        if (aberto) ctx.fill();

        // ---- 6) limpeza: esquece tiles que saíram da tela há tempo ----
        if (quadro % 180 === 0) {
            tiles.forEach((info, k) => {
                if (quadro - info.visto > 240) tiles.delete(k);
            });
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Medidor de FPS (o texto só é reconstruído a cada 0,5 s)
        const fps = this._fps;
        const agora = performance.now();
        fps.frames++;
        if (agora - fps.t >= 500) {
            fps.valor = Math.round((fps.frames * 1000) / (agora - fps.t));
            fps.ms = ((agora - fps.t) / fps.frames).toFixed(1);
            fps.texto = `FPS: ${fps.valor} (${fps.ms}ms)`;
            fps.frames = 0;
            fps.t = agora;
        }

        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(10, 10, 125, 24);
        ctx.fillStyle = fps.valor >= 55 ? "#7CFC00" : "#FFD700";
        ctx.font = "bold 12px monospace";
        ctx.fillText(fps.texto, 16, 26);

        this.quadro++;
        this.tempo += this.velocidade;
    }

    // Ponto da tela (px do canvas) -> posição na grade { gx, gy }.
    // Inverte a projeção do último frame e desce um "raio" de cima para baixo até achar a
    // superfície do terreno: o tile devolvido é exatamente o que aparece sob o ponto clicado.
    telaParaGrade(sx, sy) {
        const v = this.vista;
        if (v.cx === undefined) return null;
        const u = v.cx + (sx - v.cx) / v.zoom;       // desfaz o zoom
        const w = v.cy + (sy - v.cy) / v.zoom;
        const x1 = u - v.cx;
        const zTopo = this.amplitude * 2 * this.escalaAltura + 4;   // acima de qualquer tile
        let gx = v.camX, gy = v.camY;
        for (let z = zTopo; z >= 0; z -= 0.5) {
            const y1 = (w - v.cy + (z - v.camZ) * v.cosP) / v.sinP;
            gx = v.camX + (x1 * v.cosA + y1 * v.sinA) / v.s;
            gy = v.camY + (-x1 * v.sinA + y1 * v.cosA) / v.s;
            if (this.alturaTile(Math.round(gx), Math.round(gy)) >= z) break;
        }
        return { gx, gy };
    }

    // Sorteia o obstáculo do tile, evitando a área do personagem e do ponto inicial
    decidirObstaculo(i, j, f, paleta) {
        if (Math.abs(i) <= 4 && Math.abs(j) <= 4) return null;   // área inicial livre (itens iniciais)
        const p = this.personagem;
        if (p && p.gx !== null &&
            Math.abs(i - Math.round(p.gx)) <= 1 && Math.abs(j - Math.round(p.gy)) <= 1) return null;
        return this.obstaculos.gerar(this.algoritmo, i, j, paleta, f);
    }

    set setItens(valor) { this.itensAtivos = !!valor; }
    set setObstaculos(valor) { this.obstaculosAtivos = !!valor; }
    set setZoom(valor) { this.zoomAlvo = valor; }
    set setAmplitude(valor) { this.amplitude = valor; this._invalidarAlturas(); }
    set setFrequencia(valor) { this.frequencia = valor; this._invalidarAlturas(); }
    set setAlgoritmoTerreno(valor) { this.algoritmoTerreno = valor; this._invalidarAlturas(); }
    set setVelocidade(valor) { this.velocidade = valor; }
}
