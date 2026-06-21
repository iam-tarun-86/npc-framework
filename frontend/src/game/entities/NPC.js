import Phaser from 'phaser';

export default class NPC extends Phaser.GameObjects.Sprite {
  constructor(scene, config) {
    super(scene, config.x, config.y, 'characters', config.frame || 0);

    this.npcData = config;
    this.interactRadius = 40;

    // Render above tiles so sprite doesn't get clipped
    this.setDepth(10);

    scene.add.existing(this);
    scene.physics.add.existing(this, true);

    // Ground shadow at feet level
    this.shadow = scene.add.ellipse(this.x, this.y + 8, 12, 4, 0x000000, 0.25);
    this.shadow.setDepth(9);

    // Idle animation - subtle breathing
    scene.tweens.add({
      targets: this,
      y: this.y - 1,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Name label above NPC
    this.label = scene.add.text(this.x, this.y - 22, config.name, {
      fontSize: '10px',
      color: '#e2e8f0',
      backgroundColor: '#0f172a99',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(11);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    // Keep label and shadow synced with sprite position
    if (this.label) {
      this.label.x = this.x;
      this.label.y = this.y - 22;
    }
    if (this.shadow) {
      this.shadow.x = this.x;
      this.shadow.y = this.y + 8;
    }
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