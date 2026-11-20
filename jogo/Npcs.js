class Npc {
    constructor(ctx, tema, gx, gy, z) {
        this.g = ctx;
        this.tema = tema;
        this.def = Npcs.temas[tema];
        this.gx = gx; this.gy = gy; this.z = z;
        this.hp = this.def.hp;
        this.raio = this.def.raio;
        this.surgindo = 40;       // frames de "nascimento" (cresce e não ataca)
        this.carga = 0;           // preparando o ataque
        this.recarga = 50;
        this.flash = 0;           // brilho branco ao levar dano
        this.kx = 0; this.ky = 0; // empurrão
        this.anim = Math.random() * 100;
        this.faceX = 1;
        this.bloq = 0; this.desvio = 0; this.desvioSinal = 1;
        this.morto = false;
    }

    // ---------- lógica ----------
    livre(terreno, gx, gy) {
        const i = Math.round(gx), j = Math.round(gy);
        if (terreno.temObstaculo(i, j)) return false;
        return terreno.alturaTile(i, j) - this.z <= 14;
    }

    ajustarChao(terreno) {
        const h = terreno.alturaTile(Math.round(this.gx), Math.round(this.gy));
        this.z += (h - this.z) * 0.35;
    }

    atualizar(terreno, p, jogo) {
        this.anim++;
        if (this.flash > 0) this.flash--;
        if (this.surgindo > 0) { this.surgindo--; this.ajustarChao(terreno); return; }

        // empurrão do último golpe
        if (Math.abs(this.kx) + Math.abs(this.ky) > 0.003) {
            if (this.livre(terreno, this.gx + this.kx, this.gy)) this.gx += this.kx;
            if (this.livre(terreno, this.gx, this.gy + this.ky)) this.gy += this.ky;
            this.kx *= 0.8; this.ky *= 0.8;
        }

        const vx = p.gx - this.gx, vy = p.gy - this.gy;
        const dist = Math.hypot(vx, vy) || 1e-6;
        const nx = vx / dist, ny = vy / dist;

        // vira para o lado da tela em que o jogador está
        const sxDir = nx * Math.cos(terreno.yaw) - ny * Math.sin(terreno.yaw);
        if (Math.abs(sxDir) > 0.15) this.faceX = sxDir > 0 ? 1 : -1;

        const alcance = this.def.alcance;
        if (this.carga > 0) {
            this.carga--;
            if (this.carga === 0) {
                if (dist < alcance + 0.3 && !p.morto) p.receberDano(this.def.dano, nx, ny);
                this.recarga = 70;
            }
        } else {
            if (this.recarga > 0) this.recarga--;
            if (dist < alcance) {
                if (this.recarga <= 0 && !p.morto) this.carga = 16;
            } else if (!p.morto && dist < 45) {
                this.mover(terreno, nx, ny);
            }
        }
        this.ajustarChao(terreno);
    }

    mover(terreno, nx, ny) {
        let dx = nx, dy = ny;
        if (this.desvio > 0) {                       // contorna obstáculos que bloqueiam o caminho
            this.desvio--;
            const a = 1.0 * this.desvioSinal, c = Math.cos(a), s = Math.sin(a);
            dx = nx * c - ny * s; dy = nx * s + ny * c;
        }
        // o slime anda em pulinhos
        const f = this.tema === "bioma" ? 0.35 + 1.3 * Math.max(0, Math.sin(this.anim * 0.16)) : 1;
        const v = this.def.vel * f;
        let moveu = false;
        if (this.livre(terreno, this.gx + dx * v, this.gy)) { this.gx += dx * v; moveu = true; }
        if (this.livre(terreno, this.gx, this.gy + dy * v)) { this.gy += dy * v; moveu = true; }
        if (!moveu) {
            if (++this.bloq > 10 && this.desvio <= 0) {
                this.desvio = 40;
                this.desvioSinal = Math.random() < 0.5 ? -1 : 1;
                this.bloq = 0;
            }
        } else this.bloq = 0;
    }

    // dano de arma; (dx, dy) = direção do golpe (empurra o NPC nessa direção)
    receberDano(dano, dx, dy, jogo) {
        if (this.morto || this.surgindo > 0) return;
        this.hp -= dano;
        this.flash = 8;
        this.kx = dx * 0.2; this.ky = dy * 0.2;
        this.carga = 0;               // o golpe interrompe o ataque
        this.recarga = Math.max(this.recarga, 30);
        if (jogo) jogo.texto(this, "-" + dano, "#ffe08a");
        if (this.hp <= 0) this.morto = true;
    }

    // ---------- desenho ----------
    desenharEm(sx, sy, sinP) {
        const g = this.g;
        const t = this.surgindo > 0 ? 1 - this.surgindo / 40 : 1;
        const cresce = t * t * (3 - 2 * t);

        g.save();
        g.fillStyle = "rgba(0,0,0,0.3)";
        g.beginPath();
        g.ellipse(sx, sy, 9 * cresce * (this.def.largura || 1), Math.max(1.5, 7 * sinP) * cresce, 0, 0, Math.PI * 2);
        g.fill();

        g.translate(sx, sy);
        g.scale(cresce, cresce);
        g.save();
        g.scale(this.faceX, 1);
        g.lineJoin = "round"; g.lineCap = "round";
        const atq = this.carga > 0 ? 1 - this.carga / 16 : 0;   // 0..1 durante o preparo do golpe
        if (this.tema === "bioma") this.slime(g, atq);
        else if (this.tema === "vulcao") this.diabrete(g, atq);
        else if (this.tema === "dunas") this.escorpiao(g, atq);
        else this.golem(g, atq);
        g.restore();

        if (this.hp < this.def.hp) {                             // barra de vida
            const w = 20, y = -this.def.alt - 7;
            g.fillStyle = "#202433"; g.fillRect(-w / 2 - 1, y - 1, w + 2, 5);
            g.fillStyle = "#6d2b2b"; g.fillRect(-w / 2, y, w, 3);
            g.fillStyle = "#e0463a"; g.fillRect(-w / 2, y, w * Math.max(0, this.hp) / this.def.hp, 3);
        }
        g.restore();
    }

    // formas com contorno
    forma(g, cor) {
        g.fillStyle = this.flash > 0 ? "#ffffff" : cor; g.fill();
        g.strokeStyle = "#202433"; g.lineWidth = 0.9; g.stroke();
    }
    elip(g, x, y, rx, ry, cor, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); this.forma(g, cor); }
    circ(g, x, y, r, cor) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); this.forma(g, cor); }
    ret(g, x, y, w, h, r, cor) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
        g.closePath(); this.forma(g, cor);
    }
    poli(g, pts, cor) {
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
        g.closePath(); this.forma(g, cor);
    }
    linha(g, pts, cor, w) {
        g.strokeStyle = "#202433"; g.lineWidth = w + 1.6;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
        g.stroke();
        g.strokeStyle = this.flash > 0 ? "#ffffff" : cor; g.lineWidth = w; g.stroke();
    }

    // Slime (biomas comuns): gelatina verde que pula
    slime(g, atq) {
        const hop = Math.max(0, Math.sin(this.anim * 0.16));
        const y0 = -hop * 5;
        const rx = (10 - hop * 1.5) * (1 + atq * 0.2), ry = (7 + hop * 2) * (1 - atq * 0.25);
        this.elip(g, 0, y0 - ry, rx, ry, "#4fbf55");
        g.fillStyle = this.flash > 0 ? "#fff" : "rgba(255,255,255,0.35)";
        g.beginPath(); g.ellipse(-3.8, y0 - ry - 3, 2.6, 1.6, -0.5, 0, Math.PI * 2); g.fill();
        const ey = y0 - ry - 0.5;
        this.circ(g, -3.4, ey, 2.3, "#ffffff"); this.circ(g, 3.4, ey, 2.3, "#ffffff");
        const raiva = atq > 0 ? "#e53935" : "#202433";
        g.fillStyle = raiva;
        g.beginPath(); g.arc(-3.0, ey + 0.3, 1.1, 0, 7); g.arc(3.8, ey + 0.3, 1.1, 0, 7); g.fill();
        g.strokeStyle = "#202433"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(-6, ey - 3.6); g.lineTo(-1.6, ey - 2.2); g.moveTo(6, ey - 3.6); g.lineTo(1.6, ey - 2.2); g.stroke();
    }

    // Diabrete (vulcões): pequeno demônio que flutua, com chamas na cabeça
    diabrete(g, atq) {
        const a = this.anim;
        const y = -3 + Math.sin(a * 0.1) * 1.5 - atq * 2;
        // cauda
        this.linha(g, [[-4, y - 7], [-9, y - 5], [-11, y - 10]], "#b83a25", 1.6);
        this.poli(g, [[-11, y - 10], [-14, y - 11], [-12, y - 13.5]], "#7a1d12");
        // pernas e corpo
        this.linha(g, [[-2.5, y - 4], [-2.5, y]], "#c84030", 2.8);
        this.linha(g, [[2.5, y - 4], [2.5, y]], "#c84030", 2.8);
        this.elip(g, 0, y - 10, 6, 7.6, "#d84a32");
        // braços (erguidos ao atacar)
        const sw = Math.sin(a * 0.2) * 1.5;
        const hy = atq > 0 ? y - 21 : y - 8 + sw;
        this.linha(g, [[-5.5, y - 13], [-9, hy]], "#c84030", 2.6);
        this.linha(g, [[5.5, y - 13], [9, hy]], "#c84030", 2.6);
        // cabeça, chifres e olhos
        this.circ(g, 0, y - 20.5, 6.4, "#e35a3a");
        this.poli(g, [[-5, y - 24], [-2, y - 25.5], [-7, y - 31]], "#5a1c14");
        this.poli(g, [[5, y - 24], [2, y - 25.5], [7, y - 31]], "#5a1c14");
        this.elip(g, -2.4, y - 21, 1.5, 1.1, "#ffd23a", 0.3);
        this.elip(g, 2.4, y - 21, 1.5, 1.1, "#ffd23a", -0.3);
        g.strokeStyle = "#202433"; g.lineWidth = 1; g.beginPath();
        if (atq > 0) { g.ellipse(0, y - 16.8, 2, 1.6, 0, 0, 7); }
        else { g.moveTo(-2.4, y - 17); g.lineTo(-1, y - 16); g.lineTo(0.5, y - 17); g.lineTo(2.4, y - 16.2); }
        g.stroke();
        // chama na cabeça
        const fl = Math.sin(a * 0.5) * 1.2;
        g.fillStyle = this.flash > 0 ? "#fff" : "#ff8c1a";
        g.beginPath(); g.moveTo(-2, y - 26); g.lineTo(0, y - 31 - fl); g.lineTo(2, y - 26); g.fill();
        g.fillStyle = this.flash > 0 ? "#fff" : "#ffd23a";
        g.beginPath(); g.moveTo(-1, y - 26); g.lineTo(0, y - 29 - fl); g.lineTo(1, y - 26); g.fill();
    }

    // Escorpião (dunas): baixo, com garras e a cauda que ferroa
    escorpiao(g, atq) {
        const a = this.anim;
        // pernas
        g.strokeStyle = "#202433"; g.lineWidth = 2.6;
        for (let k = 0; k < 3; k++) {
            const x = -4 + k * 4, bal = Math.sin(a * 0.35 + k * 2) * 1.6;
            g.beginPath(); g.moveTo(x, -3); g.lineTo(x + bal, 0.4); g.stroke();
        }
        g.strokeStyle = "#8a6330"; g.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
            const x = -4 + k * 4, bal = Math.sin(a * 0.35 + k * 2) * 1.6;
            g.beginPath(); g.moveTo(x, -3); g.lineTo(x + bal, 0.4); g.stroke();
        }
        // cauda curvada com ferrão
        const reach = atq * 9;
        const tail = [[-7, -5], [-12, -9], [-11, -15], [-4 + reach, -17 + atq * 6]];
        this.linha(g, tail, "#a87a3a", 3);
        this.poli(g, [[tail[3][0], tail[3][1] - 1.5], [tail[3][0] + 3.6, tail[3][1] + 1.2], [tail[3][0] - 0.4, tail[3][1] + 2]], "#c0352b");
        // corpo
        this.elip(g, 0, -5.5, 9, 4.8, "#bd8f4d");
        g.strokeStyle = "rgba(60,40,15,0.5)"; g.lineWidth = 0.8;
        for (const x of [-3, 0, 3]) { g.beginPath(); g.moveTo(x, -9.4); g.lineTo(x, -1.8); g.stroke(); }
        this.elip(g, 7.2, -5.5, 3.6, 3.4, "#c9995a");
        // garras
        const abre = atq * 2;
        this.linha(g, [[9, -7], [13, -9]], "#a87a3a", 2);
        this.linha(g, [[9, -4], [13, -2.5]], "#a87a3a", 2);
        this.elip(g, 14.4, -9.6 - abre, 3, 2.1, "#c9995a", -0.4);
        this.elip(g, 14.4, -1.8 + abre, 3, 2.1, "#c9995a", 0.4);
        // olhos
        g.fillStyle = atq > 0 ? "#ff3b30" : "#202433";
        g.beginPath(); g.arc(8.4, -7.2, 0.9, 0, 7); g.arc(8.4, -4.2, 0.9, 0, 7); g.fill();
    }

    // Golem de pedra (cânions): lento e pesado, esmaga com os punhos
    golem(g, atq) {
        const a = this.anim;
        const bob = Math.abs(Math.sin(a * 0.07)) * 1.2;
        const braco = atq > 0 ? -34 : -9 + Math.sin(a * 0.07) * 1.5;
        this.ret(g, -6.5, -9, 5.5, 9, 1.5, "#7c6e65");
        this.ret(g, 1, -9, 5.5, 9, 1.5, "#7c6e65");
        this.ret(g, -9.5, -25 - bob, 19, 17, 3, "#9a8878");
        // braços e punhos
        this.ret(g, -14.5, -24 - bob + (atq > 0 ? braco + 18 : 0), 5, 15, 2, "#8f7d6e");
        this.ret(g, 9.5, -24 - bob + (atq > 0 ? braco + 18 : 0), 5, 15, 2, "#8f7d6e");
        this.circ(g, -12, braco > -20 ? braco : -7, 3.9, "#85766a");
        this.circ(g, 12, braco > -20 ? braco : -7, 3.9, "#85766a");
        // cabeça
        this.ret(g, -5.5, -33 - bob, 11, 9, 2.5, "#8a7a6c");
        g.fillStyle = this.flash > 0 ? "#fff" : (atq > 0 ? "#ff5a1f" : "#ffa726");
        g.fillRect(-3.8, -30 - bob, 2.4, 2.2); g.fillRect(1.4, -30 - bob, 2.4, 2.2);
        // rachaduras e musgo
        g.strokeStyle = "rgba(40,30,25,0.6)"; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(-4, -22 - bob); g.lineTo(-1, -17 - bob); g.lineTo(-3, -12 - bob); g.stroke();
        g.fillStyle = this.flash > 0 ? "#fff" : "rgba(90,140,70,0.85)";
        g.beginPath(); g.ellipse(5, -24 - bob, 3.4, 1.4, 0.2, 0, 7); g.fill();
    }
}

class Npcs {}

// Um tema por tipo de terreno (a mesma chave da paleta em Algoritmo.tipos)
Npcs.temas = {
    bioma:   { nome: "Slime",     hp: 4, vel: 0.030, dano: 1, raio: 0.45, alcance: 1.0, alt: 15 },
    vulcao:  { nome: "Diabrete",  hp: 5, vel: 0.042, dano: 2, raio: 0.42, alcance: 1.0, alt: 31 },
    dunas:   { nome: "Escorpião", hp: 4, vel: 0.038, dano: 1, raio: 0.5,  alcance: 1.15, alt: 17, largura: 1.3 },
    canions: { nome: "Golem",     hp: 9, vel: 0.022, dano: 3, raio: 0.6,  alcance: 1.2, alt: 34, largura: 1.3 },
};
