// Flecha disparada pelo arco
class Flecha {
    constructor(ctx, gx, gy, z, dx, dy, dano) {
        this.g = ctx;
        this.gx = gx; this.gy = gy; this.z = z;
        this.dx = dx; this.dy = dy;
        this.dano = dano;
        this.vel = 0.4;
        this.vida = 28;
        this.morta = false;
    }

    atualizar(jogo, terreno) {
        this.gx += this.dx * this.vel;
        this.gy += this.dy * this.vel;
        const i = Math.round(this.gx), j = Math.round(this.gy);
        if (terreno.temObstaculo(i, j) || terreno.alturaTile(i, j) - this.z > 6) {
            jogo.fagulhas(this.gx, this.gy, this.z, "#d8c8a0", 4);
            this.morta = true;
            return;
        }
        for (const n of jogo.npcs) {
            if (n.morto || n.surgindo > 0) continue;
            if (Math.hypot(n.gx - this.gx, n.gy - this.gy) < n.raio + 0.3) {
                n.receberDano(this.dano, this.dx, this.dy, jogo);
                this.morta = true;
                return;
            }
        }
        if (--this.vida <= 0) this.morta = true;
    }

    desenharEm(sx, sy, sinP, cosP, cosA, sinA) {
        const g = this.g;
        const vx = this.dx * cosA - this.dy * sinA;           // direção na tela
        const vy = (this.dx * sinA + this.dy * cosA) * sinP;
        const l = Math.hypot(vx, vy) || 1, ux = vx / l, uy = vy / l;
        const hx = sx + ux * 6, hy = sy + uy * 6, tx = sx - ux * 6, ty = sy - uy * 6;
        g.lineCap = "round";
        g.strokeStyle = "#202433"; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
        g.strokeStyle = "#b98a56"; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
        g.fillStyle = "#c9d2de";                               // ponta
        g.beginPath(); g.arc(hx, hy, 1.7, 0, 7); g.fill();
        g.fillStyle = "#c24a4a";                               // penas
        g.beginPath(); g.arc(tx, ty, 1.5, 0, 7); g.fill();
    }
}

// Partículas: fagulhas, números de dano e corações de cura
class Particula {
    constructor(ctx, gx, gy, z, vx, vy, vz, vida, tipo, cor, texto) {
        this.g = ctx;
        this.gx = gx; this.gy = gy; this.z = z;
        this.vx = vx; this.vy = vy; this.vz = vz;
        this.vida = vida; this.vidaMax = vida;
        this.tipo = tipo; this.cor = cor; this.texto = texto;
        this.morta = false;
    }

    atualizar() {
        this.gx += this.vx; this.gy += this.vy; this.z += this.vz;
        this.vz -= this.tipo === "ponto" ? 0.12 : 0;
        if (--this.vida <= 0) this.morta = true;
    }

    desenharEm(sx, sy) {
        const g = this.g;
        g.save();
        g.globalAlpha = Math.min(1, this.vida / 18);
        if (this.tipo === "texto") {
            g.font = "700 12px system-ui, sans-serif";
            g.textAlign = "center"; g.textBaseline = "middle";
            g.lineWidth = 3; g.strokeStyle = "rgba(10,12,20,0.9)"; g.lineJoin = "round";
            g.strokeText(this.texto, sx, sy);
            g.fillStyle = this.cor; g.fillText(this.texto, sx, sy);
        } else if (this.tipo === "coracao") {
            g.fillStyle = "#ff5a6a";
            g.font = "700 12px system-ui, sans-serif"; g.textAlign = "center";
            g.fillText("♥", sx, sy);
        } else {
            g.fillStyle = this.cor;
            g.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        }
        g.restore();
    }
}

// Anel no chão que mostra para onde o personagem está indo (clique do mouse)
class Marcador {
    constructor(ctx) {
        this.g = ctx;
        this.gx = 0; this.gy = 0; this.z = 0;
        this.t = 0;
    }

    desenharEm(sx, sy, sinP) {
        const g = this.g;
        const k = 1 + 0.12 * Math.sin(++this.t * 0.2);
        g.save();
        g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.8;
        g.beginPath(); g.ellipse(sx, sy, 9 * k, Math.max(2, 9 * sinP) * k, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = "rgba(255,225,120,0.95)"; g.lineWidth = 1.1;
        g.beginPath(); g.ellipse(sx, sy, 4.5, Math.max(1, 4.5 * sinP), 0, 0, Math.PI * 2); g.stroke();
        g.restore();
    }
}

// Controla o jogo: itens no chão, hotbar, combate, NPCs, flechas e partículas.
class Jogo {
    constructor(ctx, canvas, teclado, personagem) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.teclado = teclado;
        this.p = personagem;

        this.inv = new Inventario();
        this.hud = new Hud(this);

        this.ativo = false;
        this.npcsAtivos = true;
        this.terreno = null;

        this.npcs = [];
        this.projeteis = [];
        this.particulas = [];
        this.itemPerto = null;
        this.marcador = new Marcador(ctx);
        this.marcadorVisivel = false;

        this.abates = 0;
        this.tempoSpawn = 150;
        this.recarga = 0;
        this.recargaMax = 1;
        this.golpePend = null;
        this.tempoMorto = 0;
    }

    // ---------- chamado pelo terreno a cada frame ----------
    atualizar(terreno) {
        const p = this.p;
        this.terreno = terreno;

        const ev = this.teclado.eventos;
        while (ev.length) this.tratar(ev.shift());

        if (p.morto) {
            this.tempoMorto++;
            if (this.tempoMorto > 420) this.reviver();
        }

        // arma na mão
        const it = this.inv.atual();
        const def = it ? Itens.tipos[it.tipo] : null;
        p.armaTipo = def && def.cat === "arma" ? it.tipo : null;
        p.armaTiro = !!(def && def.tiro);

        if (this.recarga > 0) this.recarga--;
        if (this.golpePend && --this.golpePend.t <= 0) {
            this.resolverGolpe(this.golpePend.arma);
            this.golpePend = null;
        }

        this.itemPerto = p.morto ? null : this.procurarItem(terreno);

        // marcador do destino do mouse
        this.marcadorVisivel = !!p.destino && !p.morto;
        if (this.marcadorVisivel) {
            this.marcador.gx = p.destino.gx;
            this.marcador.gy = p.destino.gy;
            this.marcador.z = terreno.alturaTile(Math.round(p.destino.gx), Math.round(p.destino.gy));
        }

        this.atualizarNpcs(terreno);

        for (const f of this.projeteis) f.atualizar(this, terreno);
        this.projeteis = this.projeteis.filter((f) => !f.morta);
        for (const q of this.particulas) q.atualizar();
        this.particulas = this.particulas.filter((q) => !q.morta);
    }

    limpar() {
        this.npcs.length = 0;
        this.projeteis.length = 0;
        this.particulas.length = 0;
        this.itemPerto = null;
        this.golpePend = null;
    }

    // tudo que é desenhado junto com os tiles (na ordem de profundidade)
    entidades() {
        if (!this.ativo) return [];
        const lista = [this.p, ...this.npcs, ...this.projeteis, ...this.particulas];
        if (this.marcadorVisivel) lista.push(this.marcador);
        return lista;
    }

    // ---------- entrada ----------
    tratar(ev) {
        if (ev === "slot0" || ev === "slot1" || ev === "slot2") this.inv.selecionar(+ev[4]);
        else if (ev === "usar") this.usar();
        else if (ev === "pegar") this.pegar();
        else if (ev === "soltar") this.soltar();
        else if (ev === "reviver" && this.p.morto && this.tempoMorto > 30) this.reviver();
        else if (ev === "clique") {
            if (this.p.morto) { if (this.tempoMorto > 30) this.reviver(); } else this.usar();
        }
    }

    reviver() {
        this.p.reviver();
        this.tempoMorto = 0;
        this.npcs.length = 0;
        this.tempoSpawn = 240;
        this.hud.mensagem("Você voltou!", "#9be39b");
    }

    // ---------- itens ----------
    procurarItem(terreno) {
        const p = this.p;
        const ci = Math.round(p.gx), cj = Math.round(p.gy);
        let melhor = null;
        for (let i = ci - 1; i <= ci + 1; i++) {
            for (let j = cj - 1; j <= cj + 1; j++) {
                const tipo = terreno.itemEm(i, j);
                if (!tipo) continue;
                const d = Math.hypot(i - p.gx, j - p.gy);
                if (d <= 1.2 && (!melhor || d < melhor.d)) melhor = { i, j, tipo, d };
            }
        }
        return melhor;
    }

    pegar() {
        const it = this.itemPerto;
        if (this.p.morto) return;
        if (!it) { this.hud.mensagem("Nada para pegar aqui", "#c5cbd9"); return; }
        const idx = this.inv.pegar(it.tipo);
        if (idx < 0) { this.hud.mensagem("Hotbar cheia (Q solta o item)", "#ff9e9e"); return; }
        this.terreno.removerItem(it.i, it.j);
        this.inv.selecionar(idx);
        this.hud.mensagem(`Você pegou: ${Itens.tipos[it.tipo].nome}`, "#ffe08a");
    }

    soltar() {
        const atual = this.inv.atual();
        if (!atual || this.p.morto) return;
        if (!this.terreno.itensAtivos) { this.hud.mensagem("Ligue os itens para soltar", "#ff9e9e"); return; }
        if (this.colocarEmVolta(Math.round(this.p.gx), Math.round(this.p.gy), atual.tipo)) {
            this.inv.retirar();
            this.hud.mensagem(`Soltou: ${Itens.tipos[atual.tipo].nome}`, "#c5cbd9");
        }
    }

    // coloca o item no tile (i, j) ou no mais próximo que esteja livre
    colocarEmVolta(i, j, tipo) {
        const t = this.terreno;
        for (let r = 0; r <= 2; r++) {
            for (let di = -r; di <= r; di++) {
                for (let dj = -r; dj <= r; dj++) {
                    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
                    if (t.colocarItem(i + di, j + dj, tipo)) return true;
                }
            }
        }
        return false;
    }

    // ---------- combate ----------
    usar() {
        const p = this.p;
        if (p.morto) return;
        const it = this.inv.atual();
        const def = it ? Itens.tipos[it.tipo] : null;

        if (def && def.cat === "comida") {                  // comer
            if (p.vida >= p.vidaMax) { this.hud.mensagem("Sua vida já está cheia", "#c5cbd9"); return; }
            p.vida = Math.min(p.vidaMax, p.vida + def.cura);
            this.inv.retirar();
            this.hud.mensagem(`+${def.cura} de vida`, "#9be39b");
            for (let k = 0; k < 4; k++) {
                this.particulas.push(new Particula(this.ctx, p.gx + (Math.random() - 0.5) * 0.5, p.gy + (Math.random() - 0.5) * 0.5,
                    p.z + 18, 0, 0, 0.5 + Math.random() * 0.4, 34, "coracao"));
            }
            return;
        }

        const arma = def || Itens.punho;                    // sem arma: soco
        if (this.recarga > 0) return;
        this.recarga = this.recargaMax = arma.recarga;
        p.iniciarGolpe(arma.tiro ? 16 : 14);
        this.golpePend = { t: arma.tiro ? 8 : 5, arma };
    }

    resolverGolpe(arma) {
        const p = this.p;
        const dx = p.dirGx, dy = p.dirGy;
        if (arma.tiro) {
            this.projeteis.push(new Flecha(this.ctx, p.gx + dx * 0.5, p.gy + dy * 0.5, p.z + 12, dx, dy, arma.dano));
            return;
        }
        for (const n of this.npcs) {
            if (n.morto || n.surgindo > 0) continue;
            const vx = n.gx - p.gx, vy = n.gy - p.gy, d = Math.hypot(vx, vy);
            if (d > arma.alcance + n.raio) continue;
            if (d > 0.4 && (vx * dx + vy * dy) / d < 0.1) continue;   // só à frente
            n.receberDano(arma.dano, dx, dy, this);
        }
    }

    // ---------- NPCs ----------
    temaAtual(terreno) {
        const info = Algoritmo.tipos[terreno.algoritmoTerreno] || Algoritmo.tipos[0];
        return info.paleta;
    }

    atualizarNpcs(terreno) {
        const p = this.p;
        const tema = this.temaAtual(terreno);

        // sem NPCs (switch) ou tema mudou: some com os que não combinam
        for (const n of this.npcs) {
            if (!this.npcsAtivos || n.tema !== tema ||
                Math.hypot(n.gx - p.gx, n.gy - p.gy) > 60) n.morto = true, n.sumir = true;
        }

        if (this.npcsAtivos && !p.morto) {
            const max = Math.min(8, 3 + Math.floor(this.abates / 4));
            if (--this.tempoSpawn <= 0) {
                if (this.npcs.length < max) this.gerarNpc(terreno, tema);
                this.tempoSpawn = 140 + Math.random() * 120;
            }
        }

        for (const n of this.npcs) if (!n.morto) n.atualizar(terreno, p, this);

        // afasta NPCs que se sobrepõem
        for (let a = 0; a < this.npcs.length; a++) {
            for (let b = a + 1; b < this.npcs.length; b++) {
                const A = this.npcs[a], B = this.npcs[b];
                const dx = B.gx - A.gx, dy = B.gy - A.gy, d = Math.hypot(dx, dy);
                if (d > 0 && d < 0.7) {
                    const f = (0.7 - d) * 0.05 / d;
                    if (A.livre(terreno, A.gx - dx * f, A.gy - dy * f)) { A.gx -= dx * f; A.gy -= dy * f; }
                    if (B.livre(terreno, B.gx + dx * f, B.gy + dy * f)) { B.gx += dx * f; B.gy += dy * f; }
                }
            }
        }

        // mortes
        for (const n of this.npcs) {
            if (!n.morto) continue;
            this.fagulhas(n.gx, n.gy, n.z + 8, n.sumir ? "#cfd6e4" : this.corTema(n.tema), n.sumir ? 5 : 12);
            if (!n.sumir) {
                this.abates++;
                if (Math.random() < 0.4) {
                    this.colocarEmVolta(Math.round(n.gx), Math.round(n.gy), Itens.sorteio());
                }
            }
        }
        this.npcs = this.npcs.filter((n) => !n.morto);
    }

    gerarNpc(terreno, tema) {
        const p = this.p;
        for (let t = 0; t < 14; t++) {
            const ang = Math.random() * Math.PI * 2, d = 15 + Math.random() * 7;
            const gx = p.gx + Math.cos(ang) * d, gy = p.gy + Math.sin(ang) * d;
            const i = Math.round(gx), j = Math.round(gy);
            if (terreno.temObstaculo(i, j)) continue;
            if (terreno.alturaRelativa(i, j) < 0.012) continue;      // não nasce na água
            this.npcs.push(new Npc(this.ctx, tema, gx, gy, terreno.alturaTile(i, j)));
            return true;
        }
        return false;
    }

    corTema(tema) {
        return { bioma: "#4fbf55", vulcao: "#ff7a2a", dunas: "#c9995a", canions: "#9a8878" }[tema] || "#fff";
    }

    // ---------- partículas ----------
    fagulhas(gx, gy, z, cor, n) {
        for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2, v = 0.02 + Math.random() * 0.05;
            this.particulas.push(new Particula(this.ctx, gx, gy, z, Math.cos(a) * v, Math.sin(a) * v,
                1 + Math.random() * 1.8, 26, "ponto", cor));
        }
    }

    texto(entidade, txt, cor) {
        this.particulas.push(new Particula(this.ctx, entidade.gx, entidade.gy, entidade.z + (entidade.def ? entidade.def.alt : 20) + 4,
            0, 0, 0.5, 38, "texto", cor, txt));
    }

    desenharHud() {
        if (this.ativo) this.hud.desenhar(this.ctx, this.canvas);
    }
}
