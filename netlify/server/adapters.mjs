// Preserve the application's parameterized SQLite-style storage interface on Postgres.
export function postgresQuery(sql){
 const table=/^\s*INSERT INTO (\w+)/i.exec(sql)?.[1];
 if(table)sql=sql.replace(/SET attempts=attempts\+1/g,`SET attempts=${table}.attempts+1`);
 let result='',quoted=false,index=0;
 for(let i=0;i<sql.length;i++){
  const char=sql[i];
  if(char==="'"){
   result+=char;
   if(quoted&&sql[i+1]==="'"){result+=sql[++i];continue;}
   quoted=!quoted;
  }else result+=char==='?'&&!quoted?'$'+(++index):char;
 }
 return {text:result,parameters:index};
}
const integerFields=new Set(['revision','attempts','expires_at','iterations','sent_at','created_at']);
function normalizeRow(row){
 if(!row)return null;
 return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,integerFields.has(key)&&typeof value==='string'&&/^-?\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):value]));
}
export function postgresBindings(pool){
 return {
  prepare(sql){
   const query=postgresQuery(sql);let values=[];
   async function execute(){
    if(values.length!==query.parameters)throw new Error('Incorrect SQL parameter count.');
    return pool.query(query.text,values);
   }
   return {
    bind(...args){values=args;return this;},
    async first(){return normalizeRow((await execute()).rows[0]);},
    async all(){return {results:(await execute()).rows.map(normalizeRow)};},
    async run(){return {success:true,meta:{changes:(await execute()).rowCount||0}};}
   };
  }
 };
}
export function blobBindings(store){
 return {
  async head(key){const result=await store.getMetadata(key);return result?{httpEtag:result.etag,httpMetadata:result.metadata?.httpMetadata||{}}:null;},
  async put(key,bytes,options){await store.set(key,bytes.slice().buffer,{metadata:{httpMetadata:options.httpMetadata},onlyIfNew:true});},
  async get(key){const result=await store.getWithMetadata(key,{type:'arrayBuffer'});return result?{body:result.data,httpEtag:result.etag,httpMetadata:result.metadata?.httpMetadata||{}}:null;}
 };
}
