export function numericConstant(text,name){
 const match=text.match(new RegExp(`const\\s+(?:float|int)\\s+${name}\\s*=\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))(?:f)?\\s*;`));
 const number=Number(match?.[1]);
 if(!match||!Number.isFinite(number))throw new Error(`Missing literal ${name}`);
 return number;
}
