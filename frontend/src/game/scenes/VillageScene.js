import Phaser from 'phaser';
import Player from '../entities/Player';
import NPC from '../entities/NPC';
import { TILE_MAP, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, NPC_POSITIONS, PLAYER_SPAWN } from '../data/villageMap';

export default class VillageScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VillageScene' });
  }

  preload() {
    this.load.spritesheet('characters', 'assets/roguelike-characters/roguelikeChar_transparent.png', {
      frameWidth: 16,
      frameHeight: 16,
      margin: 1,
      spacing: 1
    });
  }

  create() {
    this.createMap();

    this.player = new Player(this, PLAYER_SPAWN.x * TILE_SIZE, PLAYER_SPAWN.y * TILE_SIZE);

    this.npcs = {};
    Object.entries(NPC_POSITIONS).forEach(([key, data]) => {
      this.npcs[key] = new NPC(this, {
        ...data,
        id: key,
        frame: this.getNPCFrame(key),
        x: data.x * TILE_SIZE,
        y: data.y * TILE_SIZE
      });
    });

    this.physics.world.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

    this.cameras.main.setZoom(1.5);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.dialogueOpen = false;
    window.addEventListener('dialogue-open', () => {
      this.dialogueOpen = true;
      this.input.keyboard.enabled = false;
    });
    window.addEventListener('dialogue-close', () => {
      this.dialogueOpen = false;
      this.input.keyboard.enabled = true;
    });

    // Dev toggle with T key
    this.input.keyboard.on('keydown-T', () => {
      if (!this.dialogueOpen) {
        window.dispatchEvent(new CustomEvent('toggle-dev'));
      }
    });

    // Listen to npc-state-update to set dynamic mood emotes
    window.addEventListener('npc-state-update', (event) => {
      const data = event.detail;
      Object.entries(data).forEach(([npcId, npcState]) => {
        const npcObj = this.npcs[npcId];
        if (npcObj && this.borinState === 'idle') {
          const lastMem = npcState.memories && npcState.memories.length > 0
            ? npcState.memories.slice().reverse().find(m => m.text.startsWith('Player:'))
            : null;
          const isSurprised = lastMem ? lastMem.is_core : false;
          
          if (isSurprised) {
            npcObj.setEmote('surprised');
          } else if (npcState.mood < 0.35) {
            npcObj.setEmote('angry');
          } else if (npcState.mood > 0.70) {
            npcObj.setEmote('happy');
          } else {
            npcObj.setEmote('clear');
          }
        }
      });
    });

    // Listen to debug-update to immediately show emotes when player chats in real-time!
    window.addEventListener('debug-update', (event) => {
      const debug = event.detail?.debug || event.detail;
      if (debug && debug.npc_id) {
        const npcObj = this.npcs[debug.npc_id];
        if (npcObj && this.borinState === 'idle') {
          const isSurprised = debug.surprise_triggered;
          const mood = debug.mood_score;
          
          if (isSurprised) {
            npcObj.setEmote('surprised');
          } else if (mood < 0.35) {
            npcObj.setEmote('angry');
          } else if (mood > 0.70) {
            npcObj.setEmote('happy');
          } else {
            npcObj.setEmote('clear');
          }
        }
      }
    });

    // Patrol cycle variables
    this.borinState = 'idle'; // 'idle', 'patrolling', 'chatting', 'returning'
    this.borinOriginalX = NPC_POSITIONS.borin.x * TILE_SIZE;
    this.borinOriginalY = NPC_POSITIONS.borin.y * TILE_SIZE;
    this.alaricX = NPC_POSITIONS.alaric.x * TILE_SIZE;
    this.alaricY = NPC_POSITIONS.alaric.y * TILE_SIZE;
    
    // Start first patrol after 5 seconds so the user doesn't wait 45 seconds to see him move
    this.time.delayedCall(5000, this.startPatrol, [], this);

    // Check patrol every 25 seconds
    this.time.addEvent({
      delay: 25000,
      callback: this.startPatrol,
      callbackScope: this,
      loop: true
    });
  }

  createMap() {
    const graphics = this.add.graphics();

    // Seeded random for consistent grass variation
    let seed = 12345;
    const random = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tileType = TILE_MAP[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // Grass with 3 color variations
        const grassColors = [0x4a7c4e, 0x4e8052, 0x467a4a, 0x528256];
        const pathColors = [0xC4A484, 0xba9a7a, 0xd4b494];

        let color;
        if (tileType === 0) {
          color = grassColors[Math.floor(random() * grassColors.length)];
        } else if (tileType === 3) {
          color = pathColors[Math.floor(random() * pathColors.length)];
        } else {
          color = { 1: 0x2d5a27, 2: 0x8B4513 }[tileType] || 0x4a7c4e;
        }

        graphics.fillStyle(color, 1);
        graphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Tree with leaves
        if (tileType === 1) {
          // Trunk
          graphics.fillStyle(0x5C4033, 1);
          graphics.fillRect(px + 6, py + 8, 4, 8);
          // Leaves
          graphics.fillStyle(0x2d5a27, 1);
          graphics.fillCircle(px + 8, py + 6, 5);
          graphics.fillStyle(0x3a6b32, 0.8);
          graphics.fillCircle(px + 6, py + 4, 3);
          graphics.fillCircle(px + 10, py + 5, 3);
        }
        // House with roof and door
        else if (tileType === 2) {
          // Walls
          graphics.fillStyle(0x8B4513, 1);
          graphics.fillRect(px + 2, py + 6, 12, 10);
          // Roof
          graphics.fillStyle(0x654321, 1);
          graphics.fillTriangle(px, py + 6, px + 8, py - 2, px + 16, py + 6);
          // Door
          graphics.fillStyle(0x3d2817, 1);
          graphics.fillRect(px + 6, py + 10, 4, 6);
        }
      }
    }
  }

  getNPCFrame(key) {
    const frames = { alaric: 432, borin: 487, vexis: 433, mira: 325 };
    return frames[key] || 0;
  }

  update() {
    if (this.dialogueOpen) return;

    this.player.update();

    let nearNPC = null;
    Object.entries(this.npcs).forEach(([key, npc]) => {
      // Prevent talking to Borin while he is patrolling or chatting
      if (key === 'borin' && this.borinState !== 'idle') return;

      const canTalk = npc.canInteract(this.player);
      if (canTalk) nearNPC = npc;
    });

    // Dispatch game-state for React HUD
    window.dispatchEvent(new CustomEvent('game-state', {
      detail: { nearNPC: nearNPC ? { npcData: nearNPC.getInteractData() } : null }
    }));

    if (nearNPC && this.player.isInteracting()) {
      const data = nearNPC.getInteractData();
      window.dispatchEvent(new CustomEvent('start-dialogue', { detail: data }));
      window.dispatchEvent(new CustomEvent('dialogue-open'));
    }
  }

  startPatrol() {
    // Only patrol if idle and player is not talking to anyone
    if (this.borinState === 'idle' && !this.dialogueOpen && this.npcs.borin && this.npcs.alaric) {
      this.borinState = 'patrolling';
      
      // Slide Borin to Alaric's shop
      this.tweens.add({
        targets: this.npcs.borin,
        x: this.alaricX + 24, // Stand slightly next to Alaric's shop counter
        y: this.alaricY,
        duration: 3500,
        ease: 'Power1',
        onComplete: () => {
          this.triggerNPCChat();
        }
      });
    }
  }

  async triggerNPCChat() {
    this.borinState = 'chatting';
    
    // Set speech bubble emotes for active status
    this.npcs.borin.setEmote('chatting');
    this.npcs.alaric.setEmote('chatting');
    
    try {
      const res = await fetch('http://localhost:5000/npc-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npc_id_1: 'borin', npc_id_2: 'alaric' })
      });
      const data = await res.json();
      
      if (data.transcript) {
        this.displayNPCTranscript(data.transcript);
      } else {
        this.endNPCChat();
      }
    } catch (e) {
      console.error("NPC-to-NPC chat trigger failed:", e);
      this.endNPCChat();
    }
  }

  showSpeechBubble(npc, text) {
    console.log(`[Phaser Chat Bubble] ${npc.npcData.name}: ${text}`);
    if (npc.speechBubbleText) npc.speechBubbleText.destroy();
    if (npc.speechBubbleBg) npc.speechBubbleBg.destroy();
    
    // Create text object to calculate size
    const textObject = this.add.text(npc.x, npc.y + 32, text, {
      fontSize: '8px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      wordWrap: { width: 110 },
      align: 'center'
    }).setOrigin(0.5).setDepth(21);
    
    const bubbleWidth = textObject.width + 12;
    const bubbleHeight = textObject.height + 8;
    
    // Draw a premium rounded rect bubble box
    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.95);  // Deep slate background
    bg.lineStyle(1, 0x38bdf8, 1);    // Cyan border matching dev overlay
    
    const rectX = npc.x - bubbleWidth / 2;
    const rectY = npc.y + 32 - bubbleHeight / 2;
    
    bg.fillRoundedRect(rectX, rectY, bubbleWidth, bubbleHeight, 4);
    bg.strokeRoundedRect(rectX, rectY, bubbleWidth, bubbleHeight, 4);
    
    // Draw upward pointer pointing to NPC shadow/feet
    bg.beginPath();
    bg.moveTo(npc.x - 4, rectY);
    bg.lineTo(npc.x, rectY - 4);
    bg.lineTo(npc.x + 4, rectY);
    bg.closePath();
    bg.fillPath();
    bg.strokePath();
    
    bg.setDepth(20);
    
    npc.speechBubbleText = textObject;
    npc.speechBubbleBg = bg;
  }

  displayNPCTranscript(transcript) {
    let turn = 0;
    
    const showNextTurn = () => {
      if (this.dialogueOpen) {
        // If player suddenly opens a dialogue (with someone else), abort patrol chat
        if (this.npcs.borin.speechBubbleText) this.npcs.borin.speechBubbleText.destroy();
        if (this.npcs.borin.speechBubbleBg) this.npcs.borin.speechBubbleBg.destroy();
        if (this.npcs.alaric.speechBubbleText) this.npcs.alaric.speechBubbleText.destroy();
        if (this.npcs.alaric.speechBubbleBg) this.npcs.alaric.speechBubbleBg.destroy();
        this.endNPCChat();
        return;
      }

      if (turn >= transcript.length) {
        if (this.npcs.borin.speechBubbleText) this.npcs.borin.speechBubbleText.destroy();
        if (this.npcs.borin.speechBubbleBg) this.npcs.borin.speechBubbleBg.destroy();
        if (this.npcs.alaric.speechBubbleText) this.npcs.alaric.speechBubbleText.destroy();
        if (this.npcs.alaric.speechBubbleBg) this.npcs.alaric.speechBubbleBg.destroy();
        this.endNPCChat();
        return;
      }
      
      const current = transcript[turn];
      const speakerNPC = this.npcs[current.speaker];
      const listenerNPC = current.speaker === 'borin' ? this.npcs.alaric : this.npcs.borin;
      
      // Clear listener's speech bubble
      if (listenerNPC) {
        if (listenerNPC.speechBubbleText) listenerNPC.speechBubbleText.destroy();
        if (listenerNPC.speechBubbleBg) listenerNPC.speechBubbleBg.destroy();
      }
      
      // Trigger speech bubble
      if (speakerNPC) {
        this.showSpeechBubble(speakerNPC, current.text);
      }
      
      turn++;
      // Wait 4.5 seconds per turn
      this.time.delayedCall(4500, showNextTurn);
    };
    
    showNextTurn();
  }

  endNPCChat() {
    this.npcs.borin.setEmote('clear');
    this.npcs.alaric.setEmote('clear');
    
    // Clear speech bubbles
    if (this.npcs.borin.speechBubbleText) this.npcs.borin.speechBubbleText.destroy();
    if (this.npcs.borin.speechBubbleBg) this.npcs.borin.speechBubbleBg.destroy();
    if (this.npcs.alaric.speechBubbleText) this.npcs.alaric.speechBubbleText.destroy();
    if (this.npcs.alaric.speechBubbleBg) this.npcs.alaric.speechBubbleBg.destroy();

    this.borinState = 'returning';
    
    // Return Borin to guard post
    this.tweens.add({
      targets: this.npcs.borin,
      x: this.borinOriginalX,
      y: this.borinOriginalY,
      duration: 3500,
      ease: 'Power1',
      onComplete: () => {
        this.borinState = 'idle';
        // Dispatch event to refresh developer logs in React DevPanel
        window.dispatchEvent(new CustomEvent('debug-update', {
          detail: { npc_id: 'borin' }
        }));
      }
    });
  }
}