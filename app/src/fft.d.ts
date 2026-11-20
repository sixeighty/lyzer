declare module 'fft.js' {
  export default class FFT {
    constructor(size: number)
    realTransform(output: number[], input: number[]): void
  }
}
