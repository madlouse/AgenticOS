#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const server = spawn('node', ['build/index.js'], {
  cwd: '/Users/jeking/dev/AgenticOS/mcp-server',
  stdio: ['pipe', 'pipe', 'pipe']
});

const rl = createInterface({ input: server.stdout });

let messageId = 1;

function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: messageId++,
    method,
    params
  };
  server.stdin.write(JSON.stringify(request) + '\n');
}

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (e) {
    console.log('Raw output:', line);
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

// Initialize
setTimeout(() => {
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });
}, 100);

// List tools
setTimeout(() => {
  sendRequest('tools/list');
}, 500);

// Exit after 2 seconds
setTimeout(() => {
  server.kill();
  process.exit(0);
}, 2000);
