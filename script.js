function saveName(){
const name=document.getElementById("student-name").value;
localStorage.setItem("studentName",name);
alert("Guardado");
}