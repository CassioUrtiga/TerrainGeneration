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
                        c = [0, 1, 2].map((q) => Math.round(c0[q] + (c1[q] - c0[q]) * u));
                        break;
                    }
                }
            }
            pal.push(`rgb(${c[0]},${c[1]},${c[2]})`);
        }
        return pal;
    }

    chave(i, j) {
        return (i + 32768) * 65536 + (j + 32768);
    }

    // Altura "pura" do terreno em (i, j) — i e j podem ser negativos
    alturaBruta(i, j) {
        const v = this.algoritmo.altura(
            i, j, this.algoritmoTerreno, this.frequencia, this.tempo, this.amplitude
        );
        return v > 0 ? v : 0; // negativos e NaN viram 0
    }

    // 0..1: quanto o tile já cresceu (sem registro = tile "antigo", já crescido)
    crescimento(info) {
        if (!info) return 1;
        const p = (this.quadro - info.nasc) / this.duracaoGeracao;
        if (p <= 0) return 0;
        if (p >= 1) return 1;
        return 1 - Math.pow(1 - p, 3); // easeOutCubic
    }

    // Altura (z do mundo) do tile (i, j) neste frame — usada na colisão
    alturaTile(i, j) {
        return this.alturaBruta(i, j)
            * this.crescimento(this.tiles.get(this.chave(i, j)))
            * this.escalaAltura;
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
        const camX = this.camX, camY = this.camY, camZ = this.camZ;

        // ---- 2) caixa de tiles que cobre a tela ----
        const marg = s * 2;
        const margemAltura = 40 + this.amplitude * esc * 1.2;
        const xLo = vx0 - marg, xHi = vx1 + marg;
        const yLo = vy0 - marg, yHi = vy1 + marg + margemAltura;

        let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
        for (const ux of [xLo - cx, xHi - cx]) {
            for (const uy of [yLo - cy, yHi - cy]) {
                const y1 = (uy - camZ * cosP) / sinP;
                const gi = camX + (ux * cosA + y1 * sinA) / s;
                const gj = camY + (-ux * sinA + y1 * cosA) / s;
                if (gi < minI) minI = gi; if (gi > maxI) maxI = gi;
                if (gj < minJ) minJ = gj; if (gj > maxJ) maxJ = gj;
            }
        }
        const i0 = Math.floor(minI), i1 = Math.ceil(maxI);
        const j0 = Math.floor(minJ), j1 = Math.ceil(maxJ);
        const nI = i1 - i0 + 3, nJ = j1 - j0 + 3;   // +1 de borda para os vizinhos
        const nLin = i1 - i0 + 1;

        const tam = nI * nJ;
        if (this.bufAlt.length < tam) {
            this.bufAlt = new Float32Array((tam * 1.3) | 0);
            this.bufCor = new Uint8Array(this.bufAlt.length);
        }
        if (this.rowMin.length < nLin) {
            this.rowMin = new Int32Array(nLin * 2);
            this.rowMax = new Int32Array(nLin * 2);
        }
        const alt = this.bufAlt;
        const cores = this.bufCor;
        alt.fill(NaN, 0, tam);

        // paleta do terreno atual
        const tipoInfo = Algoritmo.tipos[this.algoritmoTerreno] || Algoritmo.tipos[0];
        const paletaAtiva = this.paletas[tipoInfo.paleta];
        const invPal = this.amplitude > 0 ? 255 / (this.amplitude * 2) : 0;
        const rowMin = this.rowMin, rowMax = this.rowMax;

        // ---- 3) alturas (uma passada) + geração dos tiles ----
        // Em cada linha i só entram os j realmente visíveis (faixa exata, não a caixa inteira)
        const a1 = -sinA, a2 = cosA * sinP;
        const c2base = cy + camZ * cosP;
        const r1 = [0, 0], r2 = [0, 0];
        const tiles = this.tiles;
        const quadro = this.quadro;

        for (let i = i0; i <= i1; i++) {
            const r = i - i0;
            const dx = (i - camX) * s;
            TerrenoIsometrico.intervalo(a1, cx + dx * cosA, xLo, xHi, r1);
            TerrenoIsometrico.intervalo(a2, c2base + dx * sinA * sinP, yLo, yHi, r2);
            const lo = Math.max(r1[0], r2[0]);
            const hi = Math.min(r1[1], r2[1]);
            if (lo > hi) { rowMin[r] = 1; rowMax[r] = 0; continue; }

            const jMin = Math.max(j0, Math.ceil(camY + lo / s));
            const jMax = Math.min(j1, Math.floor(camY + hi / s));
            rowMin[r] = jMin; rowMax[r] = jMax;

            const base = (i - i0 + 1) * nJ - j0 + 1;
            for (let j = jMin; j <= jMax; j++) {
                const k = (i + 32768) * 65536 + (j + 32768);
                let info = tiles.get(k);

                if (!info) {
                    // só "nasce" quando entra de fato na tela (a faixa maior é só margem)
                    const dy = (j - camY) * s;
                    const sx = cx + dx * cosA - dy * sinA;
                    const syB = c2base + (dx * sinA + dy * cosA) * sinP;
                    if (sx > vx0 - s && sx < vx1 + s && syB > vy0 - s && syB < vy1 + s) {
                        const atraso = this.ondaInicial ? Math.hypot(i - camX, j - camY) * 2 : 0;
                        info = { nasc: quadro + atraso, visto: quadro };
                        tiles.set(k, info);
                    }
                }

                if (info) {
                    info.visto = quadro;
                    const bruta = this.alturaBruta(i, j);
                    alt[base + j] = bruta * this.crescimento(info) * esc;
                    cores[base + j] = Math.min(255, (bruta * invPal) | 0);
                } else {
                    alt[base + j] = 0; // ainda não nasceu: chão plano
                    cores[base + j] = 0;
                }
            }
        }
        this.ondaInicial = false;

        // ---- 4) valores constantes do frame, iguais para todos os tiles ----
        // deslocamento na tela de cada canto do tile (ligeiramente maior p/ cobrir frestas)
        const E = 1.04;
        const cdx = [-meio, meio, meio, -meio];
        const cdy = [-meio, -meio, meio, meio];
        const ox = [0, 0, 0, 0], oy = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
            ox[k] = (cdx[k] * cosA - cdy[k] * sinA) * E;
            oy[k] = (cdx[k] * sinA + cdy[k] * cosA) * sinP * E;
        }
        // visibilidade e cor de cada face lateral (só dependem da câmera)
        const NX = this.NX, NY = this.NY;
        const visivel = [false, false, false, false];
        const corLado = ["", "", "", ""];
        const [lr, lg, lb] = this.corLadoRGB;
        for (let k = 0; k < 4; k++) {
            visivel[k] = NX[k] * sinA + NY[k] * cosA > 1e-6;
            const n1x = NX[k] * cosA - NY[k] * sinA;
            const f = 1 - Math.max(0, Math.min(0.4, 0.12 + 0.13 * n1x));
            corLado[k] = `rgb(${(lr * f) | 0},${(lg * f) | 0},${(lb * f) | 0})`;
        }
        const viz = [-1, nJ, 1, -nJ];   // deslocamento no buffer até o vizinho de cada face

        const ti = p ? Math.round(p.gx) : 0;
        const tj = p ? Math.round(p.gy) : 0;
        let corAtual = null;

        // ---- 5) desenho de trás para frente, SEM ordenar ----
        // Basta percorrer i e j começando pelo lado mais distante da câmera.
        const iAsc = sinA >= 0, jAsc = cosA >= 0;
        for (let ri = 0; ri < nLin; ri++) {
            const i = iAsc ? i0 + ri : i1 - ri;
            const r = i - i0;
            const jMin = rowMin[r], jMax = rowMax[r];
            if (jMin > jMax) continue;

            const dx = (i - camX) * s;
            const base = (i - i0 + 1) * nJ - j0 + 1;
            const nCols = jMax - jMin + 1;

            for (let rj = 0; rj < nCols; rj++) {
                const j = jAsc ? jMin + rj : jMax - rj;
                const dy = (j - camY) * s;
                const sx = cx + dx * cosA - dy * sinA;
                const syBase = c2base + (dx * sinA + dy * cosA) * sinP;
                const idx = base + j;
                const z = alt[idx];
                const syTopo = syBase - z * cosP;

                // faces laterais: só o trecho acima do vizinho (o resto fica escondido por ele)
                if (z > 0.5) {
                    for (let k = 0; k < 4; k++) {
                        if (!visivel[k]) continue;
                        let hn = alt[idx + viz[k]];
                        if (hn !== hn) hn = this.alturaBorda(i + NX[k], j + NY[k]); // NaN
                        if (z - hn < 0.5) continue;

                        const k2 = (k + 1) & 3;
                        const syB = syBase - hn * cosP;
                        if (corLado[k] !== corAtual) { ctx.fillStyle = corLado[k]; corAtual = corLado[k]; }
                        ctx.beginPath();
                        ctx.moveTo(sx + ox[k], syTopo + oy[k]);
                        ctx.lineTo(sx + ox[k2], syTopo + oy[k2]);
                        ctx.lineTo(sx + ox[k2], syB + oy[k2]);
                        ctx.lineTo(sx + ox[k], syB + oy[k]);
                        ctx.fill();
                    }
                }

                // topo
                const cor = paletaAtiva[cores[idx]];
                if (cor !== corAtual) { ctx.fillStyle = cor; corAtual = cor; }
                ctx.beginPath();
                ctx.moveTo(sx + ox[0], syTopo + oy[0]);
                ctx.lineTo(sx + ox[1], syTopo + oy[1]);
                ctx.lineTo(sx + ox[2], syTopo + oy[2]);
                ctx.lineTo(sx + ox[3], syTopo + oy[3]);
                ctx.fill();

                // personagem: logo depois do próprio tile
                if (p && i === ti && j === tj) {
                    const pdx = (p.gx - camX) * s, pdy = (p.gy - camY) * s;
                    p.desenharEm(
                        cx + pdx * cosA - pdy * sinA,
                        cy + (pdx * sinA + pdy * cosA) * sinP - (p.z - camZ) * cosP,
                        sinP
                    );
                    corAtual = null; // o sprite mexe no estado do contexto
                }
            }
        }

        // ---- 6) limpeza: esquece tiles que saíram da tela há tempo ----
        if (quadro % 180 === 0) {
            for (const [k, info] of tiles) {
                if (quadro - info.visto > 240) tiles.delete(k);
            }
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.quadro++;
        this.tempo += this.velocidade;
    }

    set setZoom(valor) { this.zoomAlvo = valor; }
    set setAmplitude(valor) { this.amplitude = valor; }
    set setFrequencia(valor) { this.frequencia = valor; }
    set setAlgoritmoTerreno(valor) { this.algoritmoTerreno = valor; }
    set setVelocidade(valor) { this.velocidade = valor; }
}
