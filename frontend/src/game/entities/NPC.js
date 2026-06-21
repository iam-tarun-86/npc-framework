import Phaser from 'phaser';

export default class NPC extends Phaser.GameObjects.Sprite {
  constructor(scene, config) {
    super(scene, config.x, config.y, 'characters', config.frame || 0);

    this.npcData = config;
    this.interactRadius = 40;

    scene.add.existing(this);
    scene.physics.add.existing(this, true);

    // Name label above NPC
    this.label = scene.add.text(this.x, this.y - 20, config.name, {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: '#00000088'
    }).setOrigin(0.5);
  }

  canInteract(player) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    return dist <= this.interactRadius;
  }

  getInteractData() {
    return {
      npcId: this.npcData.id,
      npcName: this.npcData.name,
      role: this.npcData.role,
      portrait: this.npcData.portrait || '🧙‍♂️'
    };
  }
}