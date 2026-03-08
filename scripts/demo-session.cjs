'use strict';

const { DirectorAgent } = require('../src/agents/director-agent.cjs');
const readline = require('readline');

const DEMO_INPUTS = [
  'Organisk, jordnære farger, skandinavisk natur. Mose, fjell, morgengryet. Rent og minimalistisk.',
  'Men det skal også ha noe urbant, streetwear-aktig. Tenk Oslo meets Patagonia. Moderne og bærekraftig.',
  'Logo som kombinerer fjell-silhuett med bybilde. Enkel, ikonisk, gjenkjennelig.',
];

async function main() {
  const args = process.argv.slice(2);
  const title = args.find(a => !a.startsWith('--')) || 'IdeaForge Demo Session';
  const port = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '3333');
  const autoDemo = args.includes('--auto');

  const director = new DirectorAgent({ server: { port } });
  const session = await director.startSession(title);
  
  console.log(`\n🎨 IdeaForge Moodboard running at: ${session.serverUrl}`);
  console.log(`   Session: ${session.sessionId}`);
  console.log(`   Open in browser to see the live moodboard\n`);

  if (autoDemo) {
    console.log('Running auto-demo with 3 concepts...\n');
    for (let i = 0; i < DEMO_INPUTS.length; i++) {
      console.log(`[${i + 1}/${DEMO_INPUTS.length}] Processing: "${DEMO_INPUTS[i].substring(0, 60)}..."`);
      const result = await director.processTextInput(DEMO_INPUTS[i]);
      console.log(`   → ${result.conceptsExtracted} concepts, ${result.imagesGenerated} images\n`);
    }
    console.log('Auto-demo complete! Moodboard is live. Type more concepts or Ctrl+C to exit.\n');
  }

  // Interactive mode
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const prompt = () => {
    rl.question('💡 Enter concept (or "export" / "quit"): ', async (input) => {
      input = input.trim();
      if (!input) return prompt();
      
      if (input === 'quit' || input === 'exit') {
        await director.endSession();
        process.exit(0);
      }
      
      if (input === 'export') {
        const path = await director.exportSession();
        console.log(`📄 Exported to: ${path}\n`);
        return prompt();
      }
      
      try {
        console.log('Processing...');
        const result = await director.processTextInput(input);
        console.log(`✅ ${result.conceptsExtracted} concepts → ${result.imagesGenerated} images\n`);
      } catch (e) {
        console.error(`❌ Error: ${e.message}\n`);
      }
      prompt();
    });
  };

  prompt();

  process.on('SIGINT', async () => {
    console.log('\nEnding session...');
    await director.endSession();
    process.exit(0);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
