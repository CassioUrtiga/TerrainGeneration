class Algoritmo {
    constructor(semente = 20240607) {
        this.oitavas = 5;                   // camadas de detalhe do relevo
        this.perm = new Uint8Array(512);    // tabela de permutação do ruído
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
    }

    // Altura em (i, j), sempre entre 0 e 2 * amplitude.
    altura(i, j, tipo, frequencia, tempo, amplitude) {
        const nf = frequencia * 0.08;
        const x = i * nf, y = j * nf;
        const m = amplitude * 2;

        // Máscara de segurança na área inicial (spawn) para não abrir buracos sob o jogador
        const distOrigem2 = i * i + j * j;
        const fatorSpawn = distOrigem2 < 36 ? Math.max(0, (Math.sqrt(distOrigem2) - 2.5) / 3.5) : 1;

        let h = 0;
        switch (tipo) {
            case 0: // Colinas realistas: relevo ondulado + erosão de encosta + dolinas/lagos
                h = this.colinasRealistas(x, y, tempo, fatorSpawn);
                break;

            case 1: // Montanhas: cordilheiras com cristas, contrafortes e ravinas erodidas
                h = this.montanhasRealistas(x, y, tempo, fatorSpawn);
                break;

            case 2: // Ilhas: arquipélagos recortados, enseadas, lagos internos e erosão costeira
                h = this.ilhasRealistas(x, y, tempo, fatorSpawn);
                break;

            case 3: // Terraços: platôs geológicos quebrados por falhas e erosão
                h = this.terracosRealistas(x, y, tempo, fatorSpawn);
                break;

            case 4: // Relevo orgânico: dobras tectônicas (domain warping duplo) + vales erodidos
                h = this.organicoRealista(x, y, tempo, fatorSpawn);
                break;

            case 5: // Vulcões: cones com crateras, caldeiras secundárias e canais de lava
                h = this.vulcoes(x, y, tempo, fatorSpawn);
                break;

            case 6: // Dunas: dunas assimétricas com bacias de deflação e ondulado de vento
                h = this.dunas(x, y, tempo, fatorSpawn);
                break;

            case 7: // Cânions: platôs estratificados cortados por rios meandrantes e afluentes
                h = this.canions(x, y, tempo, fatorSpawn);
                break;

            default:
                return 0;
        }

        return (h < 0 ? 0 : h > 1 ? 1 : h) * m;
    }

    algoritmo(i, j, tipo, frequencia, tempo, amplitude) {
        return this.altura(i, j, tipo, frequencia, tempo, amplitude);
    }

    // ================== terrenos realistas com erosão e buracos ==================

    colinasRealistas(x, y, tempo, fatorSpawn) {
        // Distorção suave (domain warping) para curvas naturais de vale
        const wx = x + 0.65 * this.fbm(x * 0.7 + 3.1, y * 0.7 + 8.4, tempo, 2);
        const wy = y + 0.65 * this.fbm(x * 0.7 + 19.2, y * 0.7 + 4.7, tempo, 2);

        let h = this.normalizar(this.fbm(wx, wy, tempo, this.oitavas));
        // Aplica erosão hidráulica (sulcos nas encostas médias e sedimentação nos fundos)
        h = this.aplicarErosao(wx, wy, h, tempo, 0.24);
        // Escava buracos/dolinas naturais e pequenos lagos
        h -= this.buracos(wx, wy, 0.34, 0.42) * fatorSpawn;
        return h;
    }

    montanhasRealistas(x, y, tempo, fatorSpawn) {
        const wx = x + 0.45 * this.fbm(x * 0.8 + 11.4, y * 0.8 + 2.9, tempo, 2);
        const wy = y + 0.45 * this.fbm(x * 0.8 + 6.7, y * 0.8 + 15.1, tempo, 2);

        // Combina cristas principais com maciço de base
        const cume = this.cristas(wx, wy, tempo, this.oitavas);
        const base = this.normalizar(this.fbm(wx * 0.65, wy * 0.65, tempo, 3));
        let h = Math.min(1, cume * 0.88 + base * 0.28);

        // Ravinas profundas nas encostas íngremes
        h = this.aplicarErosao(wx * 1.15, wy * 1.15, h, tempo, 0.32);
        // Crateras/depressões glaciais (circos)
        h -= this.buracos(wx * 0.85, wy * 0.85, 0.26, 0.35) * fatorSpawn;
        return h;
    }

    ilhasRealistas(x, y, tempo, fatorSpawn) {
        const wx = x + 0.75 * this.fbm(x * 0.6 + 9.2, y * 0.6 + 1.8, tempo, 2);
        const wy = y + 0.75 * this.fbm(x * 0.6 + 22.5, y * 0.6 + 13.6, tempo, 2);

        const t = this.normalizar(this.fbm(wx, wy, tempo, this.oitavas));
        const s = (t - 0.44) / 0.56;
        if (s <= 0) return 0;

        let h = Math.min(1, Math.pow(s, 0.85) * 1.25);
        h = this.aplicarErosao(wx, wy, h, tempo, 0.22);
        // Lagoas internas e baías erodidas
        h -= this.buracos(wx * 1.1, wy * 1.1, 0.38, 0.48) * fatorSpawn;
        return h <= 0.004 ? 0 : h;
    }

    terracosRealistas(x, y, tempo, fatorSpawn) {
        const wx = x + 0.5 * this.noise2(x * 0.9 + 4.2, y * 0.9 + 7.8);
        const wy = y + 0.5 * this.noise2(x * 0.9 + 14.1, y * 0.9 + 3.3);

        const bruto = this.normalizar(this.fbm(wx, wy, tempo, this.oitavas));
        // Quebra a regularidade dos degraus com ruído local
        const irreg = bruto + 0.06 * this.noise2(x * 2.4, y * 2.4);
        let h = this.terraco(Math.max(0, Math.min(1, irreg)), 6);

        // Erosão nas bordas dos platôs e buracos de colapso (karst)
        h = this.aplicarErosao(wx, wy, h, tempo, 0.18);
        h -= this.buracos(wx, wy, 0.36, 0.45) * fatorSpawn;
        return h;
    }

    organicoRealista(x, y, tempo, fatorSpawn) {
        const qx = this.fbm(x, y, tempo, 2);
        const qy = this.fbm(x + 5.2, y + 1.3, tempo, 2);
        const rx = x + 2.8 * qx;
        const ry = y + 2.8 * qy;

        let h = this.normalizar(this.fbm(rx, ry, tempo, this.oitavas));
        h = this.aplicarErosao(rx * 0.8, ry * 0.8, h, tempo, 0.28);
        h -= this.buracos(x, y, 0.32, 0.44) * fatorSpawn;
        return h;
    }

    // Vulcões: cones com cratera, caldeiras de colapso e canais erodidos por lava
    vulcoes(x, y, tempo, fatorSpawn) {
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
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 >= R * R) continue;

                const u = Math.sqrt(d2) / R;
                const rc = 0.15;
                let h;
                if (u < rc) h = Math.pow(1 - rc, 1.4) - 0.38 * (1 - (u / rc) * (u / rc));
                else h = Math.pow(1 - u, 1.35);
                h *= 0.65 + 0.35 * this.hash2(cx, cy, 5);
                if (h > cone) cone = h;
            }
        }
        const base = this.normalizar(this.fbm(x, y, tempo, 4));
        let v = base * 0.26 + cone * 0.92;
        // Sulcos radiais de lava/erosão nas encostas do cone
        v = this.aplicarErosao(x * 1.8, y * 1.8, v, tempo, 0.22);
        // Fumarolas / buracos vulcânicos no solo
        v -= this.buracos(x * 1.3, y * 1.3, 0.28, 0.32) * fatorSpawn;
        return v;
    }

    // Dunas: cristas assimétricas + bacias de deflação (buracos escavados pelo vento)
    dunas(x, y, tempo, fatorSpawn) {
        const warp = this.fbm(x * 0.5 + 7.1, y * 0.5 + 3.3, tempo, 3);
        const u = (x * 0.8253 + y * 0.5646) * 1.6 + warp * 3.2 - tempo * 0.05;
        const f = u - Math.floor(u);

        let perfil;
        if (f < 0.72) { const r = f / 0.72; perfil = r * r * (3 - 2 * r); }
        else { const g = (f - 0.72) / 0.28; perfil = 1 - g * g * (3 - 2 * g); }

        const porte = 0.55 + 0.45 * this.normalizar(this.fbm(x * 0.3 + 40, y * 0.3 + 9, tempo, 2));
        const ondulacao = this.noise2(x * 7, y * 7) * 0.035;
        let v = perfil * porte * 0.85 + 0.09 + ondulacao;
        // Bacias de deflação e oásis rasos entre as dunas
        v -= this.buracos(x * 0.9, y * 0.9, 0.22, 0.28) * fatorSpawn;
        return v;
    }

    // Cânions: platô estratificado cortado por rio principal + afluentes erodidos + dolinas
    canions(x, y, tempo, fatorSpawn) {
        const wx = x + 0.45 * this.noise2(x * 0.7 + 3.4, y * 0.7 + 9.1);
        const wy = y + 0.45 * this.noise2(x * 0.7 + 12.8, y * 0.7 + 2.2);

        const a = this.noise2(wx * 0.55 + 11.3, wy * 0.55 + 4.7) +
                  0.35 * this.noise2(wx * 1.3 + 2.1, wy * 1.3 + 8.4);
        let vale = Math.abs(a) / 0.22;
        vale = vale > 1 ? 1 : vale;
        vale = vale * vale * (3 - 2 * vale);

        // Afluentes menores que deságuam no cânion principal
        const afluente = Math.abs(this.noise2(wx * 1.15 + 27.4, wy * 1.15 + 16.9)) / 0.14;
        const vAfl = afluente > 1 ? 1 : (0.55 + 0.45 * afluente * afluente);

        const t = this.normalizar(this.fbm(wx, wy, tempo, this.oitavas));
        const plato = (0.45 + 0.55 * t) * Math.pow(vale, 0.8) * vAfl;
        let h = this.terraco(plato, 8);

        h = this.aplicarErosao(wx * 1.2, wy * 1.2, h, tempo, 0.20);
        h -= this.buracos(wx, wy, 0.30, 0.40) * fatorSpawn;
        return h;
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
        const g00 = this.grad2(perm[a], xf, yf);
        const g10 = this.grad2(perm[b], xf - 1, yf);
        const g01 = this.grad2(perm[a + 1], xf, yf - 1);
        const g11 = this.grad2(perm[b + 1], xf - 1, yf - 1);

        const x0 = g00 + u * (g10 - g00);
        const x1 = g01 + u * (g11 - g01);
        return x0 + v * (x1 - x0);
    }

    grad2(h, x, y) {
        switch (h & 7) {
            case 0: return x + y;
            case 1: return y - x;
            case 2: return x - y;
            case 3: return -x - y;
            case 4: return x;
            case 5: return -x;
            case 6: return y;
            default: return -y;
        }
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

        const l1 = this.lerp(u, this.grad3(perm[AA], xf, yf, zf), this.grad3(perm[BA], xf - 1, yf, zf));
        const l2 = this.lerp(u, this.grad3(perm[AB], xf, yf - 1, zf), this.grad3(perm[BB], xf - 1, yf - 1, zf));
        const l3 = this.lerp(u, this.grad3(perm[AA + 1], xf, yf, zf - 1), this.grad3(perm[BA + 1], xf - 1, yf, zf - 1));
        const l4 = this.lerp(u, this.grad3(perm[AB + 1], xf, yf - 1, zf - 1), this.grad3(perm[BB + 1], xf - 1, yf - 1, zf - 1));
        return this.lerp(w, this.lerp(v, l1, l2), this.lerp(v, l3, l4));
    }

    lerp(t, a, b) { return a + t * (b - a); }

    grad3(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
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
