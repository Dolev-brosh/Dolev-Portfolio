const projectButtons = document.querySelectorAll('.project-box')

console.log(projectButtons);

projectButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        console.log(e.target.className);
        
        if (e.target.className === 'project-header one') {
            window.location.href = "project-one.html"    
        } else if (e.target.className === 'project-header two'){
            window.location.href = "project-two.html"
        } else if(e.target.className === 'project-header three'){
            window.location.href = "project-three.html"
        }
    })
})

function initComparisons() {
  const overlays = document.getElementsByClassName("img-comp-overlay");
  for (let i = 0; i < overlays.length; i++) {
    compareImages(overlays[i]);
  }

  function compareImages(img) {
    let clicked = false;
    let w = img.offsetWidth;
    let h = img.offsetHeight;


    let slider = document.createElement("DIV");
    slider.setAttribute("class", "img-comp-slider");
    slider.style.left = slider.style.left = (img.offsetWidth - slider.offsetWidth/2) + "px";
    img.parentElement.insertBefore(slider, img);


    slider.addEventListener("mousedown", slideReady);
    window.addEventListener("mouseup", slideFinish);
    slider.addEventListener("touchstart", slideReady);
    window.addEventListener("touchend", slideFinish);

    function slideReady(e) {
      e.preventDefault();
      clicked = true;
      window.addEventListener("mousemove", slideMove);
      window.addEventListener("touchmove", slideMove);
    }

    function slideFinish() {
      clicked = false;
      window.removeEventListener("mousemove", slideMove);
      window.removeEventListener("touchmove", slideMove);
    }

    function slideMove(e) {
      if (!clicked) return;
      let pos;
      if (e.touches) {
        pos = e.touches[0].pageX - img.getBoundingClientRect().left;
      } else {
        pos = e.pageX - img.getBoundingClientRect().left;
      }
      if (pos < 0) pos = 0;
      if (pos > img.parentElement.offsetWidth) pos = img.parentElement.offsetWidth;
      slide(pos);
    }

    function slide(x) {
      img.style.width = x + "px";
      slider.style.left = (img.offsetWidth - slider.offsetWidth/2) + "px";

    }
  }
}

window.addEventListener('load', initComparisons);