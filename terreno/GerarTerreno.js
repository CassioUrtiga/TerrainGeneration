class GerarTerreno {
    constructor(caneta, joystick = null, personagem = null) {
        this.caneta = caneta;
        this.joystick = joystick;

        this.tipoTerreno = 0;
        this.linhas = 30;
        this.colunas = 25;

        this.velocidadeRotacao = 0.05;
        this.zonaMorta = 0.05;

        this.terrenos = [
            new TerrenoIsometrico(this.caneta, this.linhas, this.colunas),
        ];

        // o personagem é atualizado e desenhado dentro do terreno (colisão + profundidade)
        for (const terreno of this.terrenos) terreno.personagem = personagem;
    }

    desenhar() {
        const terrenoAtual = this.terrenos[this.tipoTerreno];

        terrenoAtual.setAlgoritmoTerreno = parseInt(document.getElementById("algoritmo").value);
        terrenoAtual.setVelocidade = parseFloat(document.getElementById("velocidade").value);
        terrenoAtual.setAmplitude = parseInt(document.getElementById("amplitude").value);
        terrenoAtual.setFrequencia = parseFloat(document.getElementById("frequencia").value);

        if (this.joystick) {
            const x = Math.abs(this.joystick.x) > this.zonaMorta ? this.joystick.x : 0;
            const y = Math.abs(this.joystick.y) > this.zonaMorta ? this.joystick.y : 0;
            terrenoAtual.rotacionar(-x * this.velocidadeRotacao, y * this.velocidadeRotacao);
        }

        terrenoAtual.desenhar();
    }

    definirPersonagem(personagem) {
        for (const terreno of this.terrenos) terreno.personagem = personagem;
    }

    resetarVista() {
        this.terrenos[this.tipoTerreno].resetarVista();
    }
}
