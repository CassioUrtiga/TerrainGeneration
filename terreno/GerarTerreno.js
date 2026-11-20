class GerarTerreno {
    constructor(caneta, joystick = null, personagem = null, jogo = null) {
        this.caneta = caneta;
        this.joystick = joystick;

        this.tipoTerreno = 0;
        this.velocidadeRotacao = 0.05;
        this.zonaMorta = 0.05;

        // elementos do painel buscados uma vez (e não a cada frame)
        this.elAlgoritmo = document.getElementById("algoritmo");
        this.elVelocidade = document.getElementById("velocidade");
        this.elAmplitude = document.getElementById("amplitude");
        this.elFrequencia = document.getElementById("frequencia");
        this.elZoom = document.getElementById("zoom");
        this.elObstaculos = document.getElementById("obstaculosAtivos");
        this.elNpcs = document.getElementById("npcsAtivos");
        this.elItens = document.getElementById("itensAtivos");
        this.jogo = jogo;

        this.terrenos = [
            new TerrenoIsometrico(this.caneta),
        ];

        for (const terreno of this.terrenos) {
            terreno.personagem = personagem;
            terreno.jogo = jogo;
        }
    }

    desenhar() {
        const terrenoAtual = this.terrenos[this.tipoTerreno];

        terrenoAtual.setAlgoritmoTerreno = parseInt(this.elAlgoritmo.value);
        terrenoAtual.setVelocidade = parseFloat(this.elVelocidade.value);
        terrenoAtual.setAmplitude = parseInt(this.elAmplitude.value);
        terrenoAtual.setFrequencia = parseFloat(this.elFrequencia.value);

        if (this.elZoom) terrenoAtual.setZoom = parseFloat(this.elZoom.value);
        if (this.elObstaculos) terrenoAtual.setObstaculos = this.elObstaculos.checked;
        if (this.elItens) terrenoAtual.setItens = this.elItens.checked;
        if (this.jogo && this.elNpcs) this.jogo.npcsAtivos = this.elNpcs.checked;

        if (this.joystick) {
            const x = Math.abs(this.joystick.x) > this.zonaMorta ? this.joystick.x : 0;
            const y = Math.abs(this.joystick.y) > this.zonaMorta ? this.joystick.y : 0;
            terrenoAtual.rotacionar(-x * this.velocidadeRotacao, y * this.velocidadeRotacao);
        }

        terrenoAtual.desenhar();
    }

    // personagem = instância para ligar, ou null para desligar
    definirPersonagem(personagem) {
        for (const terreno of this.terrenos) terreno.personagem = personagem;
    }

    resetarVista() {
        this.terrenos[this.tipoTerreno].resetarVista();
    }
}
