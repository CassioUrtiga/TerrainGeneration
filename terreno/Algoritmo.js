const ALG_GX2 = new Int8Array([1, -1, 1, -1, 1, -1, 0, 0]);
const ALG_GY2 = new Int8Array([1, 1, -1, -1, 0, 0, 1, -1]);
const ALG_G3 = (() => {
    const gx = new Int8Array(16), gy = new Int8Array(16), gz = new Int8Array(16);
    for (let h = 0; h < 16; h++) {
        const u = h < 8 ? "x" : "y";
        const v = h < 4 ? "y" : (h === 12 || h === 14 ? "x" : "z");
        const su = (h & 1) ? -1 : 1, sv = (h & 2) ? -1 : 1;
        for (const [eixo, s] of [[u, su], [v, sv]]) {
            if (eixo === "x") gx[h] = s; else if (eixo === "y") gy[h] = s; else gz[h] = s;
        }
    }
    return { gx, gy, gz };
})();
const ALG_G3X = ALG_G3.gx, ALG_G3Y = ALG_G3.gy, ALG_G3Z = ALG_G3.gz;

class Algoritmo {
    constructor(semente = 20240607) {
        this.oitavas = 5;                   // camadas de detalhe do relevo
        this.perm = new Uint8Array(512);    // tabela de permutação do ruído

        // ---- cache por tile ----
        // Quase todo o relevo (warp, sulcos, buracos...) NÃO depende do tempo: só as oitavas
        // 3D do fbm e o 2º sulco mudam a cada frame. A parte fixa é calculada uma vez por tile
        // e guardada aqui; a cada frame só a parte animada é recalculada.
        // Índice direto: (i & 255, j & 511) -> janelas de até 256 x 512 tiles sem colisão.
        const N = 1 << 17;
        this._gen = 1;                      // muda quando semente/tipo/frequência/oitavas mudam
        this._ci = new Int32Array(N);
        this._cj = new Int32Array(N);
        this._cg = new Int32Array(N);       // 0 = vazio
        this._sd = new Float64Array(N * 8); // parte fixa (8 valores por tile)
        this._ct = new Float64Array(N).fill(NaN);   // tempo do último resultado
        this._ch = new Float64Array(N);             // último resultado (0..1, antes da amplitude)
        this._esc = new Float64Array(8);            // área temporária (i, j não inteiros)
        this._sigTipo = -1; this._sigFreq = NaN; this._sigOit = -1;

        this.semear(semente);
    }

    // Muda o "mundo": a mesma semente sempre gera o mesmo relevo
    semear(semente) {
        this.semente = semente | 0;
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        let s = semente >>> 0;
        const rnd = () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = 255; i > 0; i--) {
            const j = (rnd() * (i + 1)) | 0;
            const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
        }
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
        this._gen++;                        // invalida o cache
    }

    // Altura em (i, j), sempre entre 0 e 2 * amplitude.
    altura(i, j, tipo, frequencia, tempo, amplitude) {
        if (!(tipo >= 0 && tipo <= 7) || (tipo | 0) !== tipo) return 0;   // tipo inválido
        const nf = frequencia * 0.08;
        const m = amplitude * 2;
        const x = i * nf, y = j * nf;
        let h;

        if ((i | 0) === i && (j | 0) === j) {
            const oit = this.oitavas;
            if (tipo !== this._sigTipo || frequencia !== this._sigFreq || oit !== this._sigOit) {
                this._sigTipo = tipo; this._sigFreq = frequencia; this._sigOit = oit;
                this._gen++;
            }
            const idx = ((i & 255) << 9) | (j & 511);
            const o = idx << 3;
            if (this._cg[idx] === this._gen && this._ci[idx] === i && this._cj[idx] === j) {
                if (this._ct[idx] === tempo) {          // mesma consulta no mesmo instante
                    h = this._ch[idx];
                    return (h < 0 ? 0 : h > 1 ? 1 : h) * m;
                }
            } else {
                this._cg[idx] = this._gen; this._ci[idx] = i; this._cj[idx] = j;
                this._estatico(tipo, i, j, x, y, this._sd, o);
            }
            h = this._dinamico(tipo, this._sd, o, x, y, tempo);
            this._ct[idx] = tempo; this._ch[idx] = h;
        } else {
            this._estatico(tipo, i, j, x, y, this._esc, 0);
            h = this._dinamico(tipo, this._esc, 0, x, y, tempo);
        }
        return (h < 0 ? 0 : h > 1 ? 1 : h) * m;
    }

    algoritmo(i, j, tipo, frequencia, tempo, amplitude) {
        return this.altura(i, j, tipo, frequencia, tempo, amplitude);
    }

    // ================== parte FIXA de cada terreno (não depende do tempo) ==================
    // Slots: sd[o + k]. NaN = "ainda não calculado" (sulco e buraco são calculados só se forem usados).
    // sd[o + 7] = fator da área inicial (spawn).

    _estatico(tipo, i, j, x, y, sd, o) {
        // Máscara de segurança na área inicial (spawn) para não abrir buracos sob o jogador
        const d2 = i * i + j * j;
        sd[o + 7] = d2 < 36 ? Math.max(0, (Math.sqrt(d2) - 2.5) / 3.5) : 1;

        switch (tipo) {
            case 0: { // Colinas
                const wx = x + 0.65 * this._fbm2n(x * 0.7 + 3.1, y * 0.7 + 8.4);
                const wy = y + 0.65 * this._fbm2n(x * 0.7 + 19.2, y * 0.7 + 4.7);
                sd[o] = wx; sd[o + 1] = wy; sd[o + 2] = this._fbm2(wx, wy);
                sd[o + 3] = NaN; sd[o + 4] = NaN;
                break;
            }
            case 1: { // Montanhas
                const wx = x + 0.45 * this._fbm2n(x * 0.8 + 11.4, y * 0.8 + 2.9);
                const wy = y + 0.45 * this._fbm2n(x * 0.8 + 6.7, y * 0.8 + 15.1);
                sd[o] = wx; sd[o + 1] = wy;
                // 2 primeiras oitavas das cristas
                let n = 1 - Math.abs(this.noise2(wx, wy));
                n *= n;
                let soma = n, prev = n;
                n = 1 - Math.abs(this.noise2(wx * 2.03 + 31.7, wy * 2.03 + 17.3));
                n *= n;
                soma += n * 0.5 * prev; prev = n;
                sd[o + 2] = soma; sd[o + 3] = prev;
                sd[o + 4] = this._fbm2(wx * 0.65, wy * 0.65);
                sd[o + 5] = NaN; sd[o + 6] = NaN;
                break;
            }
            case 2: { // Ilhas
                const wx = x + 0.75 * this._fbm2n(x * 0.6 + 9.2, y * 0.6 + 1.8);
                const wy = y + 0.75 * this._fbm2n(x * 0.6 + 22.5, y * 0.6 + 13.6);
                sd[o] = wx; sd[o + 1] = wy; sd[o + 2] = this._fbm2(wx, wy);
                sd[o + 3] = NaN; sd[o + 4] = NaN;
                break;
            }
            case 3: { // Terraços
                const wx = x + 0.5 * this.noise2(x * 0.9 + 4.2, y * 0.9 + 7.8);
                const wy = y + 0.5 * this.noise2(x * 0.9 + 14.1, y * 0.9 + 3.3);
                sd[o] = wx; sd[o + 1] = wy; sd[o + 2] = this._fbm2(wx, wy);
                sd[o + 3] = this.noise2(x * 2.4, y * 2.4);
                sd[o + 4] = NaN; sd[o + 5] = NaN;
                break;
            }
            case 4: { // Relevo orgânico
                const qx = this._fbm2n(x, y);
                const qy = this._fbm2n(x + 5.2, y + 1.3);
                const rx = x + 2.8 * qx, ry = y + 2.8 * qy;
                sd[o] = rx; sd[o + 1] = ry; sd[o + 2] = this._fbm2(rx, ry);
                sd[o + 3] = NaN; sd[o + 4] = NaN;
                break;
            }
            case 5: { // Vulcões
                const xs = x * 1.6, ys = y * 1.6;
                const xi = Math.floor(xs), yi = Math.floor(ys);
                let cone = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const cx = xi + dx, cy = yi + dy;
                        if (this.hash2(cx, cy, 1) > 0.62) continue;
                        const px = cx + 0.25 + 0.5 * this.hash2(cx, cy, 2);
                        const py = cy + 0.25 + 0.5 * this.hash2(cx, cy, 3);
                        const R = 0.5 + 0.42 * this.hash2(cx, cy, 4);
                        const ddx = xs - px, ddy = ys - py;
                        const dd2 = ddx * ddx + ddy * ddy;
                        if (dd2 >= R * R) continue;

                        const u = Math.sqrt(dd2) / R;
                        const rc = 0.15;
                        let h;
                        if (u < rc) h = Math.pow(1 - rc, 1.4) - 0.38 * (1 - (u / rc) * (u / rc));
                        else h = Math.pow(1 - u, 1.35);
                        h *= 0.65 + 0.35 * this.hash2(cx, cy, 5);
                        if (h > cone) cone = h;
                    }
                }
                sd[o] = cone; sd[o + 1] = this._fbm2(x, y);
                sd[o + 2] = NaN; sd[o + 3] = NaN;
                break;
            }
            case 6: { // Dunas
                sd[o] = this._fbm2(x * 0.5 + 7.1, y * 0.5 + 3.3);
                sd[o + 1] = 0.55 + 0.45 * this.normalizar(this._fbm2n(x * 0.3 + 40, y * 0.3 + 9));
                sd[o + 2] = this.noise2(x * 7, y * 7) * 0.035;
                sd[o + 3] = (x * 0.8253 + y * 0.5646) * 1.6;
                sd[o + 4] = NaN;
                break;
            }
            default: { // 7 - Cânions (quase tudo é fixo)
                const wx = x + 0.45 * this.noise2(x * 0.7 + 3.4, y * 0.7 + 9.1);
                const wy = y + 0.45 * this.noise2(x * 0.7 + 12.8, y * 0.7 + 2.2);
                const a = this.noise2(wx * 0.55 + 11.3, wy * 0.55 + 4.7) +
                          0.35 * this.noise2(wx * 1.3 + 2.1, wy * 1.3 + 8.4);
                let vale = Math.abs(a) / 0.22;
                vale = vale > 1 ? 1 : vale;
                vale = vale * vale * (3 - 2 * vale);
                const afluente = Math.abs(this.noise2(wx * 1.15 + 27.4, wy * 1.15 + 16.9)) / 0.14;
                const vAfl = afluente > 1 ? 1 : (0.55 + 0.45 * afluente * afluente);
                sd[o] = wx; sd[o + 1] = wy;
                sd[o + 2] = Math.pow(vale, 0.8); sd[o + 3] = vAfl;
                sd[o + 4] = this._fbm2(wx, wy);
                sd[o + 5] = NaN; sd[o + 6] = NaN;
                break;
            }
        }
    }

    // ================== parte ANIMADA de cada terreno ==================

    _dinamico(tipo, sd, o, x, y, tempo) {
        const oit = this.oitavas;
        switch (tipo) {
            case 0: { // Colinas realistas: relevo ondulado + erosão de encosta + dolinas/lagos
                const wx = sd[o], wy = sd[o + 1];
                let h = this.normalizar(this._fbmP(wx, wy, tempo, oit, sd[o + 2]));
                h = this._erosao(sd, o + 3, wx, wy, h, tempo, 0.24);
                h -= this._buraco(sd, o, o + 4, wx, wy, 0.34, 0.42);
                return h;
            }
            case 1: { // Montanhas: cordilheiras com cristas, contrafortes e ravinas erodidas
                const wx = sd[o], wy = sd[o + 1];
                const cume = oit >= 2
                    ? this._cristasFim(wx, wy, tempo, oit, sd[o + 2], sd[o + 3])
                    : this.cristas(wx, wy, tempo, oit);
                const base = this.normalizar(this._fbmFim(wx * 0.65, wy * 0.65, tempo, 3, sd[o + 4]));
                let h = Math.min(1, cume * 0.88 + base * 0.28);
                h = this._erosao(sd, o + 5, wx * 1.15, wy * 1.15, h, tempo, 0.32);
                h -= this._buraco(sd, o, o + 6, wx * 0.85, wy * 0.85, 0.26, 0.35);
                return h;
            }
            case 2: { // Ilhas: arquipélagos recortados, enseadas, lagos internos
                const wx = sd[o], wy = sd[o + 1];
                const t = this.normalizar(this._fbmP(wx, wy, tempo, oit, sd[o + 2]));
                const s = (t - 0.44) / 0.56;
                if (s <= 0) return 0;               // oceano: nada mais é calculado
                let h = Math.min(1, Math.pow(s, 0.85) * 1.25);
                h = this._erosao(sd, o + 3, wx, wy, h, tempo, 0.22);
                h -= this._buraco(sd, o, o + 4, wx * 1.1, wy * 1.1, 0.38, 0.48);
                return h <= 0.004 ? 0 : h;
            }
            case 3: { // Terraços: platôs geológicos quebrados por falhas e erosão
                const wx = sd[o], wy = sd[o + 1];
                const bruto = this.normalizar(this._fbmP(wx, wy, tempo, oit, sd[o + 2]));
                const irreg = bruto + 0.06 * sd[o + 3];
                let h = this.terraco(Math.max(0, Math.min(1, irreg)), 6);
                h = this._erosao(sd, o + 4, wx, wy, h, tempo, 0.18);
                h -= this._buraco(sd, o, o + 5, wx, wy, 0.36, 0.45);
                return h;
            }
            case 4: { // Relevo orgânico: dobras tectônicas + vales erodidos
                const rx = sd[o], ry = sd[o + 1];
                let h = this.normalizar(this._fbmP(rx, ry, tempo, oit, sd[o + 2]));
                h = this._erosao(sd, o + 3, rx * 0.8, ry * 0.8, h, tempo, 0.28);
                h -= this._buraco(sd, o, o + 4, x, y, 0.32, 0.44);
                return h;
            }
            case 5: { // Vulcões: cones com crateras e canais de lava
                const base = this.normalizar(this._fbmFim(x, y, tempo, 4, sd[o + 1]));
                let v = base * 0.26 + sd[o] * 0.92;
                v = this._erosao(sd, o + 2, x * 1.8, y * 1.8, v, tempo, 0.22);
                v -= this._buraco(sd, o, o + 3, x * 1.3, y * 1.3, 0.28, 0.32);
                return v;
            }
            case 6: { // Dunas: cristas assimétricas + bacias de deflação
                const warp = this._fbmFim(x * 0.5 + 7.1, y * 0.5 + 3.3, tempo, 3, sd[o]);
                const u = sd[o + 3] + warp * 3.2 - tempo * 0.05;
                const f = u - Math.floor(u);
                let perfil;
                if (f < 0.72) { const r = f / 0.72; perfil = r * r * (3 - 2 * r); }
                else { const g = (f - 0.72) / 0.28; perfil = 1 - g * g * (3 - 2 * g); }
                let v = perfil * sd[o + 1] * 0.85 + 0.09 + sd[o + 2];
                v -= this._buraco(sd, o, o + 4, x * 0.9, y * 0.9, 0.22, 0.28);
                return v;
            }
            default: { // 7 - Cânions: platôs estratificados cortados por rios
                const wx = sd[o], wy = sd[o + 1];
                const t = this.normalizar(this._fbmP(wx, wy, tempo, oit, sd[o + 4]));
                const plato = (0.45 + 0.55 * t) * sd[o + 2] * sd[o + 3];
                let h = this.terraco(plato, 8);
                h = this._erosao(sd, o + 5, wx * 1.2, wy * 1.2, h, tempo, 0.20);
                h -= this._buraco(sd, o, o + 6, wx, wy, 0.30, 0.40);
                return h;
            }
        }
    }

    // fbm de 2 oitavas (só ruído 2D, sem tempo): soma bruta e normalizada
    _fbm2(x, y) {
        const n0 = this.noise2(x, y);
        const n1 = this.noise2(x * 2.03 + 31.7, y * 2.03 + 17.3);
        return n0 + n1 * 0.5;
    }
    _fbm2n(x, y) { return this._fbm2(x, y) / 1.5; }

    // continua o fbm da oitava 2 em diante (as 2 primeiras já vêm somadas em `soma`)
    _fbmFim(x, y, tempo, oit, soma) {
        let amp = 0.25, freq = 2.03 * 2.03, norm = 1.5;
        for (let o = 2; o < oit; o++) {
            const n = this.noise3(x * freq + o * 31.7, y * freq + o * 17.3, tempo * 0.12 * o);
            soma += n * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2.03;
        }
        return soma / norm;
    }
    _fbmP(x, y, tempo, oit, soma2) {
        return oit >= 2 ? this._fbmFim(x, y, tempo, oit, soma2) : this.fbm(x, y, tempo, oit);
    }

    _cristasFim(x, y, tempo, oit, soma, prev) {
        let amp = 0.25, freq = 2.03 * 2.03, norm = 1.5;
        for (let o = 2; o < oit; o++) {
            let n = this.noise3(x * freq + o * 31.7, y * freq + o * 17.3, tempo * 0.12 * o);
            n = 1 - Math.abs(n);
            n *= n;
            soma += n * amp * prev;
            prev = n;
            norm += amp;
            amp *= 0.5;
            freq *= 2.03;
        }
        return soma / norm;
    }

    // erosão com o sulco 2D guardado em sd[k] (calculado só na 1ª vez em que for preciso)
    _erosao(sd, k, x, y, h, tempo, intensidade) {
        if (h <= 0.01) return h;
        let sulco1 = sd[k];
        if (sulco1 !== sulco1) {
            sulco1 = 1 - Math.abs(this.noise2(x * 2.6 + 13.7, y * 2.6 + 29.1));
            sd[k] = sulco1;
        }
        const sulco2 = 1 - Math.abs(this.noise3(x * 5.2 + 7.3, y * 5.2 + 19.8, tempo * 0.08));
        const rede = Math.pow(sulco1 * 0.65 + sulco2 * 0.35, 2.2);
        const mascaraEncosta = Math.sin(Math.min(1, h) * Math.PI);
        const deposicao = h < 0.18 ? (0.18 - h) * 0.25 : 0;
        return h - rede * mascaraEncosta * intensidade + deposicao;
    }

    // buraco (já multiplicado pelo fator do spawn) guardado em sd[k]
    _buraco(sd, o, k, x, y, limiar, profundidade) {
        let b = sd[k];
        if (b !== b) {
            b = this.buracos(x, y, limiar, profundidade) * sd[o + 7];
            sd[k] = b;
        }
        return b;
    }

    // ================== erosão e buracos procedurais ==================

    /**
     * Simula erosão hidráulica/térmica:
     * Cria sulcos e ravinas nas encostas (alturas médias) enquanto suaviza
     * e deposita sedimentos nos fundos dos vales (alturas baixas).
     */
    aplicarErosao(x, y, h, tempo, intensidade) {
        if (h <= 0.01) return h;
        // Sulcos ramificados (ridged noise de média/alta frequência)
        const sulco1 = 1 - Math.abs(this.noise2(x * 2.6 + 13.7, y * 2.6 + 29.1));
        const sulco2 = 1 - Math.abs(this.noise3(x * 5.2 + 7.3, y * 5.2 + 19.8, tempo * 0.08));
        const rede = Math.pow(sulco1 * 0.65 + sulco2 * 0.35, 2.2);

        // A erosão atua com mais força nas encostas (h entre 0.15 e 0.85)
        const mascaraEncosta = Math.sin(Math.min(1, h) * Math.PI);
        // Nos fundos baixos (h < 0.18), parte do material vira deposição plana
        const deposicao = h < 0.18 ? (0.18 - h) * 0.25 : 0;

        return h - rede * mascaraEncosta * intensidade + deposicao;
    }

    /**
     * Gera buracos naturais, dolinas (sinkholes) e crateras de erosão.
     * @param {number} limiar - controla a frequência (menor = mais buracos)
     * @param {number} profundidade - quanto rebaixa o terreno (0..1)
     */
    buracos(x, y, limiar, profundidade) {
        // Campo de distorção para os buracos não serem círculos perfeitos
        const dx = 0.28 * this.noise2(x * 2.2 + 41.3, y * 2.2 + 17.9);
        const dy = 0.28 * this.noise2(x * 2.2 + 8.6, y * 2.2 + 53.1);

        // Ruído celular/Billow invertido cria bacias fechadas isoladas
        const n1 = Math.abs(this.noise2((x + dx) * 1.35 + 101.5, (y + dy) * 1.35 + 64.2));
        const n2 = Math.abs(this.noise2((x + dx) * 2.9 + 12.4, (y + dy) * 2.9 + 88.7));
        const campo = n1 * 0.78 + n2 * 0.22;

        if (campo >= limiar) return 0;

        // Transição suave na borda do buraco + fundo côncavo irregular
        const t = 1 - campo / limiar;
        const borda = t * t * (3 - 2 * t);
        const rugosidadeFundo = 0.85 + 0.15 * this.noise2(x * 6.5, y * 6.5);
        return borda * profundidade * rugosidadeFundo;
    }

    // ================== ferramentas ==================

    fbm(x, y, tempo, oitavas) {
        let soma = 0, amp = 1, freq = 1, norm = 0;
        for (let o = 0; o < oitavas; o++) {
            const px = x * freq + o * 31.7, py = y * freq + o * 17.3;
            const n = o < 2 ? this.noise2(px, py) : this.noise3(px, py, tempo * 0.12 * o);
            soma += n * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2.03;
        }
        return soma / norm;
    }

    cristas(x, y, tempo, oitavas) {
        let soma = 0, amp = 1, freq = 1, norm = 0, prev = 1;
        for (let o = 0; o < oitavas; o++) {
            const px = x * freq + o * 31.7, py = y * freq + o * 17.3;
            let n = o < 2 ? this.noise2(px, py) : this.noise3(px, py, tempo * 0.12 * o);
            n = 1 - Math.abs(n);
            n *= n;
            soma += n * amp * prev;
            prev = n;
            norm += amp;
            amp *= 0.5;
            freq *= 2.03;
        }
        return soma / norm;
    }

    normalizar(f) {
        const t = 0.5 + f * 1.3;
        return t < 0 ? 0 : t > 1 ? 1 : t;
    }

    terraco(v, degraus) {
        const k = v * degraus;
        const base = Math.floor(k);
        let u = (k - base - 0.35) / 0.3;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        return Math.min(1, (base + u * u * (3 - 2 * u)) / degraus);
    }

    hash2(ix, iy, s) {
        let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s + this.semente, 1442695041)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }

    // ================== ruído de Perlin ==================
    noise2(x, y) {
        const perm = this.perm;
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const X = xi & 255, Y = yi & 255;
        const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
        const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

        const a = perm[X] + Y, b = perm[X + 1] + Y;
        const h00 = perm[a] & 7, h10 = perm[b] & 7, h01 = perm[a + 1] & 7, h11 = perm[b + 1] & 7;
        const xf1 = xf - 1, yf1 = yf - 1;
        const g00 = ALG_GX2[h00] * xf + ALG_GY2[h00] * yf;
        const g10 = ALG_GX2[h10] * xf1 + ALG_GY2[h10] * yf;
        const g01 = ALG_GX2[h01] * xf + ALG_GY2[h01] * yf1;
        const g11 = ALG_GX2[h11] * xf1 + ALG_GY2[h11] * yf1;

        const x0 = g00 + u * (g10 - g00);
        const x1 = g01 + u * (g11 - g01);
        return x0 + v * (x1 - x0);
    }

    grad2(h, x, y) {
        const k = h & 7;
        return ALG_GX2[k] * x + ALG_GY2[k] * y;
    }

    noise3(x, y, z) {
        const perm = this.perm;
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const xf = x - xi, yf = y - yi, zf = z - zi;
        const X = xi & 255, Y = yi & 255, Z = zi & 255;
        const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
        const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
        const w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);

        const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
        const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
        const xf1 = xf - 1, yf1 = yf - 1, zf1 = zf - 1;

        let h = perm[AA] & 15;
        const g000 = ALG_G3X[h] * xf + ALG_G3Y[h] * yf + ALG_G3Z[h] * zf;
        h = perm[BA] & 15;
        const g100 = ALG_G3X[h] * xf1 + ALG_G3Y[h] * yf + ALG_G3Z[h] * zf;
        h = perm[AB] & 15;
        const g010 = ALG_G3X[h] * xf + ALG_G3Y[h] * yf1 + ALG_G3Z[h] * zf;
        h = perm[BB] & 15;
        const g110 = ALG_G3X[h] * xf1 + ALG_G3Y[h] * yf1 + ALG_G3Z[h] * zf;
        h = perm[AA + 1] & 15;
        const g001 = ALG_G3X[h] * xf + ALG_G3Y[h] * yf + ALG_G3Z[h] * zf1;
        h = perm[BA + 1] & 15;
        const g101 = ALG_G3X[h] * xf1 + ALG_G3Y[h] * yf + ALG_G3Z[h] * zf1;
        h = perm[AB + 1] & 15;
        const g011 = ALG_G3X[h] * xf + ALG_G3Y[h] * yf1 + ALG_G3Z[h] * zf1;
        h = perm[BB + 1] & 15;
        const g111 = ALG_G3X[h] * xf1 + ALG_G3Y[h] * yf1 + ALG_G3Z[h] * zf1;

        const l1 = g000 + u * (g100 - g000);
        const l2 = g010 + u * (g110 - g010);
        const l3 = g001 + u * (g101 - g001);
        const l4 = g011 + u * (g111 - g011);
        const m1 = l1 + v * (l2 - l1);
        const m2 = l3 + v * (l4 - l3);
        return m1 + w * (m2 - m1);
    }

    lerp(t, a, b) { return a + t * (b - a); }

    grad3(hash, x, y, z) {
        const h = hash & 15;
        return ALG_G3X[h] * x + ALG_G3Y[h] * y + ALG_G3Z[h] * z;
    }
}

// Terrenos disponíveis (índice = valor do slider) e a paleta de cada um
Algoritmo.tipos = [
    { nome: "Colinas",         paleta: "bioma" },
    { nome: "Montanhas",       paleta: "bioma" },
    { nome: "Ilhas",           paleta: "bioma" },
    { nome: "Terraços",        paleta: "bioma" },
    { nome: "Relevo orgânico", paleta: "bioma" },
    { nome: "Vulcões",         paleta: "vulcao" },
    { nome: "Dunas",           paleta: "dunas" },
    { nome: "Cânions",         paleta: "canions" },
];
Algoritmo.nomes = Algoritmo.tipos.map((t) => t.nome);

// Paletas: [altura relativa 0..1, [r, g, b]]. A água (altura 0) é a primeira faixa.
Algoritmo.paletas = {
    bioma: [
        [0.005, [46, 110, 180]],   // água
        [0.006, [222, 205, 150]],  // areia
        [0.05,  [205, 190, 130]],
        [0.12,  [96, 150, 60]],    // grama clara
        [0.45,  [60, 118, 46]],    // grama escura
        [0.62,  [96, 104, 62]],    // mata / terra
        [0.70,  [125, 110, 90]],   // rocha marrom
        [0.85,  [150, 148, 146]],  // rocha cinza
        [0.92,  [235, 238, 245]],  // neve
        [1.00,  [255, 255, 255]],
    ],
    vulcao: [
        [0.00,  [96, 92, 70]],     // cinzas
        [0.10,  [96, 112, 62]],    // vegetação rasteira
        [0.28,  [88, 78, 62]],     // terra escura
        [0.50,  [66, 60, 58]],     // basalto
        [0.72,  [48, 44, 46]],
        [0.86,  [120, 50, 28]],    // borda incandescente
        [0.95,  [230, 100, 28]],   // lava
        [1.00,  [255, 190, 60]],
    ],
    dunas: [
        [0.00,  [170, 130, 85]],
        [0.25,  [205, 168, 108]],
        [0.55,  [228, 196, 138]],
        [0.85,  [243, 222, 172]],
        [1.00,  [252, 240, 200]],
    ],
    canions: [
        [0.005, [46, 110, 180]],   // rio
        [0.006, [196, 170, 120]],  // margem
        [0.12,  [176, 92, 58]],    // camadas de rocha
        [0.25,  [206, 128, 76]],
        [0.38,  [228, 176, 112]],
        [0.50,  [170, 84, 54]],
        [0.64,  [210, 134, 80]],
        [0.78,  [232, 186, 126]],
        [0.90,  [188, 106, 68]],
        [1.00,  [244, 208, 160]],
    ],
};
