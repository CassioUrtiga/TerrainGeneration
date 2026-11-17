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

    // Altura em (i, j), sempre entre 0 e 2 * amplitude. Funciona em coordenadas negativas.
    // A frequência controla o tamanho das formas (maior = relevo mais "apertado").
    altura(i, j, tipo, frequencia, tempo, amplitude) {
        const nf = frequencia * 0.08;
        const x = i * nf, y = j * nf;
        const m = amplitude * 2;

        switch (tipo) {
            case 0: // Colinas: ruído fractal (grandes formas + camadas de detalhe)
                return this.normalizar(this.fbm(x, y, tempo, this.oitavas)) * m;

            case 1: { // Montanhas: cristas afiadas e vales suaves
                const r = this.cristas(x, y, tempo, this.oitavas);
                return Math.min(1, r * 1.1) * m;
            }
            case 2: { // Ilhas: o que fica abaixo do nível do mar vira água (altura 0)
                const t = this.normalizar(this.fbm(x, y, tempo, this.oitavas));
                const s = (t - 0.47) / 0.53;
                return s <= 0 ? 0 : Math.min(1, s * 1.25) * m;
            }
            case 3: // Terraços: degraus suaves, formando mesas e platôs
                return this.terraco(this.normalizar(this.fbm(x, y, tempo, this.oitavas)), 6) * m;

            case 4: { // Relevo orgânico: o ruído é distorcido por outro ruído
                const qx = this.fbm(x, y, tempo, 2);
                const qy = this.fbm(x + 5.2, y + 1.3, tempo, 2);
                return this.normalizar(this.fbm(x + 3 * qx, y + 3 * qy, tempo, this.oitavas)) * m;
            }
            case 5: return this.vulcoes(x, y, tempo) * m;
            case 6: return this.dunas(x, y, tempo) * m;
            case 7: return this.canions(x, y, tempo) * m;
        }
        return 0;
    }

    // mesmo que altura() (nome antigo)
    algoritmo(i, j, tipo, frequencia, tempo, amplitude) {
        return this.altura(i, j, tipo, frequencia, tempo, amplitude);
    }

    // ================== terrenos avançados ==================

    // Vulcões: cones espalhados por células aleatórias, cada um com cratera, sobre um relevo baixo
    vulcoes(x, y, tempo) {
        const xs = x * 1.6, ys = y * 1.6;
        const xi = Math.floor(xs), yi = Math.floor(ys);
        let cone = 0;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const cx = xi + dx, cy = yi + dy;
                if (this.hash2(cx, cy, 1) > 0.6) continue;          // ~60% das células têm vulcão
                const px = cx + 0.25 + 0.5 * this.hash2(cx, cy, 2);  // centro do vulcão
                const py = cy + 0.25 + 0.5 * this.hash2(cx, cy, 3);
                const R = 0.5 + 0.4 * this.hash2(cx, cy, 4);         // raio da base
                const ddx = xs - px, ddy = ys - py;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 >= R * R) continue;

                const u = Math.sqrt(d2) / R;   // 0 = centro, 1 = pé do vulcão
                const rc = 0.14;               // raio da cratera
                let h;
                if (u < rc) h = Math.pow(1 - rc, 1.4) - 0.3 * (1 - (u / rc) * (u / rc)); // cratera
                else h = Math.pow(1 - u, 1.4);                                          // encosta
                h *= 0.65 + 0.35 * this.hash2(cx, cy, 5);            // cada vulcão com sua altura
                if (h > cone) cone = h;
            }
        }
        const base = this.normalizar(this.fbm(x, y, tempo, 4));
        const v = base * 0.28 + cone * 0.9;
        return v > 1 ? 1 : v;
    }

    // Dunas: cristas assimétricas (subida suave, descida íngreme) que se curvam e migram devagar
    dunas(x, y, tempo) {
        const warp = this.fbm(x * 0.5 + 7.1, y * 0.5 + 3.3, tempo, 3);
        const u = (x * 0.8253 + y * 0.5646) * 1.6 + warp * 3.2 - tempo * 0.05;
        const f = u - Math.floor(u);

        let perfil;
        if (f < 0.72) { const r = f / 0.72; perfil = r * r * (3 - 2 * r); }
        else { const g = (f - 0.72) / 0.28; perfil = 1 - g * g * (3 - 2 * g); }

        const porte = 0.55 + 0.45 * this.normalizar(this.fbm(x * 0.3 + 40, y * 0.3 + 9, tempo, 2));
        const ondulacao = this.noise2(x * 7, y * 7) * 0.04;      // marcas finas na areia
        const v = perfil * porte * 0.85 + 0.08 + ondulacao;
        return v < 0 ? 0 : v > 1 ? 1 : v;
    }

    // Cânions: platô em camadas cortado por rios sinuosos (altura 0 = água)
    canions(x, y, tempo) {
        const a = this.noise2(x * 0.55 + 11.3, y * 0.55 + 4.7) +
                  0.35 * this.noise2(x * 1.3 + 2.1, y * 1.3 + 8.4);
        let vale = Math.abs(a) / 0.22;                // 0 no centro do rio
        vale = vale > 1 ? 1 : vale;
        vale = vale * vale * (3 - 2 * vale);

        const t = this.normalizar(this.fbm(x, y, tempo, this.oitavas));
        const plato = 0.45 + 0.55 * t;
        return this.terraco(plato * Math.pow(vale, 0.8), 8);
    }

    // ================== ferramentas ==================

    // ruído fractal: soma de camadas, cada uma com o dobro da frequência e metade da força.
    // As 2 primeiras camadas (formas grandes) são fixas; as demais "respiram" com o tempo.
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

    // ruído "ridged": 1 - |ruído| cria cristas; cada camada é ponderada pela anterior
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

    // ruído fractal (~[-0.4, 0.4]) -> 0..1, aproveitando melhor a faixa de alturas
    normalizar(f) {
        const t = 0.5 + f * 1.3;
        return t < 0 ? 0 : t > 1 ? 1 : t;
    }

    // 0..1 em degraus com transição suave (patamares planos entre as subidas)
    terraco(v, degraus) {
        const k = v * degraus;
        const base = Math.floor(k);
        let u = (k - base - 0.35) / 0.3;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        return Math.min(1, (base + u * u * (3 - 2 * u)) / degraus);
    }

    // número pseudo-aleatório estável (0..1) para a célula (ix, iy)
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
