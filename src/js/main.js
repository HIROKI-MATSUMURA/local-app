import { fadeIn, slideUp } from './animation';

// const element = document.querySelector('.fade-element');
// if (element) {
//   fadeIn(element);
// }

// const slideElement = document.querySelector('.slide-element');
// if (slideElement) {
//   slideUp(slideElement);
// }


alert('Hello, Vite!'); // eslint-disable-line no-alert
// .test要素を取得
const testElement = document.querySelector('.test');

// クリックイベントを追加
testElement.addEventListener('click', () => {
  // 文字サイズを変更するアニメーション
  testElement.style.transition = 'font-size 3s';  // 3秒の遷移
  testElement.style.fontSize = '50px';  // 文字サイズを50pxに変更
});
