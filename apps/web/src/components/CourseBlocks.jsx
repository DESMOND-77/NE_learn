import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {Copy,Check,Info,Lightbulb,AlertTriangle,ArrowRight,FlaskConical,ClipboardCheck,ExternalLink} from 'lucide-react';
import {RichText} from './ui.jsx';
import {Interactive} from './Interactive.jsx';
export function CodeBlock({code,title,language='text'}){const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false);const copy=async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setFailed(false);setTimeout(()=>setCopied(false),2000);}catch{setFailed(true);}};return <div className="code-block"><div className="code-header"><span>{title||language}</span><button onClick={copy} aria-label="Copier le code">{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copié':failed?'Sélectionne le texte':'Copier'}</button></div><pre><code>{code}</code></pre></div>;}
export function CourseBlock({block}){
 switch(block.type){
  case 'paragraph':return <p><RichText text={block.text}/></p>;
  case 'heading':return <h3>{block.text}</h3>;
  case 'list':return block.ordered?<ol>{block.items.map((x,i)=><li key={i}><RichText text={x}/></li>)}</ol>:<ul>{block.items.map((x,i)=><li key={i}><RichText text={x}/></li>)}</ul>;
  case 'table':return <div className="table-scroll course-table"><table><thead><tr>{block.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{block.rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}><RichText text={c}/></td>)}</tr>)}</tbody></table></div>;
  case 'code':return <CodeBlock {...block}/>;
  case 'note':{const Icon=block.variant==='warning'?AlertTriangle:block.variant==='tip'?Lightbulb:Info;return <aside className={`course-note ${block.variant}`}><Icon size={20}/><div><strong>{block.title}</strong><p><RichText text={block.text}/></p></div></aside>;}
  case 'formula':return <div className="formula-block"><div className="formula-main">{block.text}</div>{block.variables?.length>0&&<ul>{block.variables.map((v,i)=><li key={i}>{v}</li>)}</ul>}</div>;
  case 'interactive':return <figure className="interactive-figure"><div className="interactive-figure-label"><span className="status-dot"/> À TOI DE MANIPULER</div><Interactive component={block.component} props={block.props}/>{block.caption&&<figcaption>{block.caption}</figcaption>}</figure>;
  case 'quiz-link':return <Link className="content-action" to={`/quiz/${block.quizId}`}><ClipboardCheck size={22}/><span>{block.text||'Quiz de validation'}</span><ArrowRight size={18}/></Link>;
  case 'lab-link':return <Link className="content-action lab" to={`/laboratoires/${block.labId}`}><FlaskConical size={22}/><span>{block.text||'Passer au laboratoire'}</span><ArrowRight size={18}/></Link>;
  default:return null;
 }
}
