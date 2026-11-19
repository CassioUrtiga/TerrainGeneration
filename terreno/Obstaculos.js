class Obstaculos {
    constructor(resolucao = 3) {
        this.R = resolucao;
        this.sprites = { 
            arvore: [], 
            pinheiro: [], 
            pedra: [], 
            cacto: [], 
            morta: [] 
        };
        this.criarSprites();
    }

    // ---------- decisão: o que nasce em cada tile ----------
    // f = altura relativa do tile (0 = nível da água, 1 = topo mais alto)
    // Retorna null (nada) ou { kind, variante, esc, ox, oy }
    gerar(alg, i, j, paleta, f) {
        const r = alg.hash2(i, j, 21);
        const h3 = alg.hash2(i, j, 22);

        // agrupamento: bosques e campos de pedras formam manchas, em vez de pontos soltos
        const n = alg.noise2(i * 0.16 + 3.1, j * 0.16 + 9.7) * 1.6;
        const dens = 0.25 + 1.5 * (0.5 + 0.5 * (n < -1 ? -1 : n > 1 ? 1 : n));

        let kind = null, variante = 0;

        if (paleta === "bioma") {
            if (f < 0.012) return null;                       // água
            if (f < 0.05) {                                   // praia
                if (r < 0.015) kind = "pedra";
            } else if (f < 0.45) {                            // campo
                if (r < 0.10 * dens) {
                    if (f > 0.3 && h3 < 0.4) kind = "pinheiro";
                    else { kind = "arvore"; variante = h3 < 0.15 ? 2 : (h3 < 0.55 ? 0 : 1); }
                } else if (r > 0.98) kind = "pedra";
            } else if (f < 0.62) {                            // floresta
                if (r < 0.16 * dens) {
                    if (h3 < 0.55) kind = "pinheiro";
                    else { kind = "arvore"; variante = h3 < 0.8 ? 0 : 1; }
                } else if (r > 0.975) kind = "pedra";
            } else if (f < 0.85) {                            // encosta rochosa
                if (r < 0.07 * dens) kind = "pedra";
                else if (r > 0.97 && f < 0.72) { kind = "pinheiro"; variante = f > 0.66 ? 1 : 0; }
            } else if (r < 0.03) kind = "pedra";              // picos
        } else if (paleta === "vulcao") {
            if (f >= 0.86) return null;                       // lava
            if (f < 0.25) {
                if (r < 0.05 * dens) kind = "morta";
                else if (r > 0.985) { kind = "pedra"; variante = 2; }
            } else {
                if (r < 0.065 * dens) { kind = "pedra"; variante = 2; }
                else if (r > 0.99 && f < 0.5) kind = "morta";
            }
        } else if (paleta === "dunas") {
            if (r < 0.022 * dens) kind = "cacto";
            else if (r > 0.992) { kind = "pedra"; variante = 1; }
        } else if (paleta === "canions") {
            if (f < 0.012) return null;                       // rio
            if (r < 0.055 * dens) { kind = "pedra"; variante = 1; }
            else if (r > 0.975 && f < 0.5) kind = "cacto";
        }

        if (!kind) return null;
        return {
            kind, variante,
            esc: 0.85 + 0.35 * alg.hash2(i, j, 23),           // tamanho
            ox: (alg.hash2(i, j, 24) - 0.5) * 0.36,           // pequeno desvio dentro do tile
            oy: (alg.hash2(i, j, 25) - 0.5) * 0.36,
        };
    }

    // (x, y) = pé do obstáculo na tela; escala = tamanho extra (cresce junto com o tile)
    desenhar(ctx, ob, x, y, escala) {
        const sp = this.sprites[ob.kind][ob.variante];
        if (!sp) return;
        const k = ob.esc * escala;
        ctx.drawImage(sp.img, x - sp.ax * k, y - sp.ay * k, sp.w * k, sp.h * k);
    }

    // ---------- sprites ----------
    novo(w, h, ax, ay, desenhar) {
        const c = document.createElement("canvas");
        c.width = Math.ceil(w * this.R);
        c.height = Math.ceil(h * this.R);
        const g = c.getContext("2d");
        g.scale(this.R, this.R);
        desenhar(g);
        return { img: c, w, h, ax, ay }; // (ax, ay) = ponto do chão dentro do sprite
    }

    sombra(g, x, y, rx, ry) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
    }

    circulo(g, x, y, r, cor) {
        g.fillStyle = cor;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
    }

    poligono(g, pontos, cor) {
        g.fillStyle = cor;
        g.beginPath();
        g.moveTo(pontos[0][0], pontos[0][1]);
        for (let k = 1; k < pontos.length; k++) g.lineTo(pontos[k][0], pontos[k][1]);
        g.closePath();
        g.fill();
    }

    arredondado(g, x, y, w, h, r, cor) {
        g.fillStyle = cor;
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
        g.fill();
    }

    criarSprites() {
        // árvores de copa redonda: verde, verde-azulada e outono
        const copas = [
            ["#2e6e34", "#40904a", "#68b04a"],
            ["#265f3c", "#348050", "#58a05c"],
            ["#a05020", "#c8782a", "#e0a040"],
        ];
        for (const c of copas) {
            this.sprites.arvore.push(this.novo(26, 38, 13, 35, (g) => {
                this.sombra(g, 13, 35, 9, 3.2);
                g.fillStyle = "#5a3d26"; g.fillRect(11.4, 22, 3.2, 13);
                g.fillStyle = "#46301e"; g.fillRect(13.2, 22, 1.4, 13);
                this.circulo(g, 13, 17, 10.5, c[0]);
                this.circulo(g, 9.5, 15, 7.5, c[1]);
                this.circulo(g, 16.5, 13.5, 6.5, c[1]);
                this.circulo(g, 11, 11.5, 4.5, c[2]);
            }));
        }

        // pinheiros: normal e nevado
        for (const nevado of [false, true]) {
            this.sprites.pinheiro.push(this.novo(22, 42, 11, 39, (g) => {
                this.sombra(g, 11, 39, 7, 2.8);
                g.fillStyle = "#5a3d26"; g.fillRect(9.6, 31, 2.8, 8);
                const camadas = [[15, 33, 9.5], [9, 25, 7.5], [3, 17, 5.5]]; // [topo, base, meia-largura]
                for (const [topo, base, hw] of camadas) {
                    this.poligono(g, [[11, topo], [11 + hw, base], [11 - hw, base]], "#1f5636");
                    this.poligono(g, [[11, topo], [11, base], [11 - hw, base]], "#2f7448");
                    if (nevado) {
                        const y = topo + (base - topo) * 0.4;
                        this.poligono(g, [[11, topo], [11 + hw * 0.4, y], [11 - hw * 0.4, y]], "#f4f8ff");
                    }
                }
            }));
        }

        // pedras: cinza, marrom e escura (basalto)
        const rochas = [["#84848a", "#b0b0b6", "#5e5e66"], ["#96785c", "#c0a07e", "#6e5440"], ["#3e3a3e", "#645e64", "#26222a"]];
        for (const [base, luz, sombra] of rochas) {
            this.sprites.pedra.push(this.novo(22, 16, 11, 13.5, (g) => {
                this.sombra(g, 11, 13.5, 9, 2.8);
                this.poligono(g, [[3, 13], [2, 8], [6, 3.5], [12, 2.5], [18, 4.5], [20.5, 9], [19, 13]], base);
                this.poligono(g, [[6, 3.5], [12, 2.5], [15, 4], [10, 8], [4, 9]], luz);
                this.poligono(g, [[10, 8], [15, 4], [18, 4.5], [20.5, 9], [19, 13], [11, 13]], sombra);
            }));
        }

        // cacto
        this.sprites.cacto.push(this.novo(18, 34, 9, 31, (g) => {
            this.sombra(g, 9, 31.5, 6, 2.4);
            this.arredondado(g, 2, 10, 3.2, 8.5, 1.5, "#4f9a58");
            this.arredondado(g, 2, 15.5, 6, 3.2, 1.5, "#4f9a58");
            this.arredondado(g, 12.8, 13, 3.2, 9.5, 1.5, "#4f9a58");
            this.arredondado(g, 10, 19.5, 6, 3.2, 1.5, "#4f9a58");
            this.arredondado(g, 6.5, 5, 5, 26.5, 2.5, "#4f9a58");
            g.fillStyle = "#7cc47c"; g.fillRect(8.4, 8, 1.1, 21);
            this.circulo(g, 9, 5.5, 1.4, "#e0607a");
        }));

        // árvore morta
        this.sprites.morta.push(this.novo(24, 36, 12, 33, (g) => {
            this.sombra(g, 12, 33.5, 7, 2.6);
            this.poligono(g, [[10.4, 33], [13.6, 33], [12.7, 14], [11.3, 14]], "#4a3626");
            g.strokeStyle = "#4a3626"; g.lineCap = "round";
            g.lineWidth = 2;
            g.beginPath(); g.moveTo(12, 23); g.lineTo(6, 16); g.lineTo(4, 10); g.stroke();
            g.beginPath(); g.moveTo(12.4, 19); g.lineTo(18, 12); g.lineTo(20, 7); g.stroke();
            g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(12, 15); g.lineTo(11, 7); g.stroke();
        }));
    }
}
