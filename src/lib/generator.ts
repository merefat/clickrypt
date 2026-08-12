export interface GeneratorOptions {
  length?: number;
  useUppercase?: boolean;
  useLowercase?: boolean;
  useNumbers?: boolean;
  useSymbols?: boolean;
  type?: 'password' | 'passphrase';
}

const WORDS = [
  'correct', 'horse', 'battery', 'staple', 'vault', 'crypto', 'shield', 'cipher',
  'vector', 'matrix', 'secure', 'quantum', 'signal', 'beacon', 'portal', 'anchor',
  'breeze', 'canyon', 'dragon', 'ember', 'forest', 'glacier', 'harbor', 'island'
];

/**
 * Generate a cryptographically secure random password or passphrase
 */
export function generatePassword(options: GeneratorOptions = {}): string {
  const {
    length = 16,
    useUppercase = true,
    useLowercase = true,
    useNumbers = true,
    useSymbols = true,
    type = 'password'
  } = options;

  if (type === 'passphrase') {
    // Generate Diceware style passphrase: e.g., correct-horse-battery-staple-7X!
    const selectedWords: string[] = [];
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    for (let i = 0; i < 4; i++) {
      selectedWords.push(WORDS[array[i] % WORDS.length]);
    }
    const num = Math.floor(Math.random() * 90 + 10);
    const sym = '!@#$%^&*'[Math.floor(Math.random() * 8)];
    return `${selectedWords.join('-')}-${num}${sym}`;
  }

  // Random character password
  let chars = '';
  if (useLowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (useUppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (useNumbers) chars += '0123456789';
  if (useSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  let password = '';
  const cryptoArr = new Uint32Array(length);
  crypto.getRandomValues(cryptoArr);

  for (let i = 0; i < length; i++) {
    password += chars[cryptoArr[i] % chars.length];
  }

  return password;
}
