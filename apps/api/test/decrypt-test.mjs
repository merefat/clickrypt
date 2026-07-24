import { decryptWithPassphrase } from "../../../packages/crypto/dist/index.js";

const blob = {
  version: 1,
  kdf: {
    algorithm: "argon2id",
    memoryKiB: 65536,
    iterations: 3,
    parallelism: 4,
    keyLength: 32,
    salt: "+BjdHJglXN0spX9Ky2j0Sg==",
  },
  iv: "QJ2dhrEiA1UEcQQ2",
  ciphertext: "W1xAiy+OXZ13SSaBQqYYY0Kq+RE0ijDJL8V515QLwQnPXJDFGNpRACNFoKyK24VSSUFwPiuTYAI/gIfAJwirEwgjiG4Ek2+uGPm2wU2/9iEH9Uzt/cGVuPzq9lETbc5D5RnPP6tBII4VJO+Yy5enB0jWHZdd5HM4DRdV9ICXmLms+yG8YXRIlJr7/24XQGK2WxrihkvO7PQhCUAcXGxskLQkl1t8UNw76dNbzufEhwfma6QBRez+AWBs64u6hEy0ytv2fzRRP1owh6bX/OnbotbY8GLc7rcTX1KDNOfEo9u8MgKwc6ohrvJ8IeVZedvN+3mak0kWaEnesBXMUnEeBB1U9Y6R1xfulrBUJrmOqCRqU1lpLVHK2Fvj4s4Jz6QmI6X4wDsVCMWAVWlPWMCHuJZeQ5AZ9PW4WMMcnwu7cpFGxIg7RfZbngLVjkPpP/qE1ypnQe7puZ45JkULzDeqDrUHVaGqXTNWB/UfGkxD5CeMpCMP9dt9pZ8yJTB/+d7AtrjFO6yQP6AjM91AQUUn1Jk5eIDkjIzNjfJCAt+vRtZElnjxn/P32mvaAkbZh7Q2c45mE63VxJtr8k7SpTO0clbAhynfHNJftyw3eEKq8288OQx5XgqpvZ5iwpwp9BWHdTdS5a2kuaPKLd8OIQWgpBLG47O/8bUcoEkInXssMJR/f4DXRCXUzGg4gQFIfnY5ykgFtfCInkN6WqQ0XNkn6hufIofeze+9ScZiyxpgkywMIcFoxRBPumnmr5q+wrfhHO29fZSLX4x8E5X4BBpaaCagS4GoFgq/2uJrPegiBb2+JTdOwuHJT5pkK4jGCTdfAmjjqd6v//uO4D656bir/Sr3oqO2auuB5Hb39XACAZoLrzYSZlblF5DXleY90Ygl2BEiwHBYmNBO/IHYSTj0WUBszuhyjS1KKelu/5VXmF90QMlGBTumur/o5aShRWNozOwaBWAaX859mOr0+Ln6QaNVILVN4XnnxroW32mYCV/F3GThn5PtFc3DKd4=",
};

const passphrase = "refat123456789";

try {
  const privateKey = await decryptWithPassphrase(blob, passphrase);
  console.log("SUCCESS! Decrypted private key:");
  console.log(privateKey.substring(0, 80) + "...");
} catch (err) {
  console.log("FAILED:", err.message);
}
