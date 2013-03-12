var top=require('./taobao-api.js');

var cli=top.client('appkey', 'secretcode');

var api=cli.apiSample();
api.session='';
api.method='taobao.items.onsale.get';
api.args={fields:'num_iid'};
cli.on(api.method, function(json){
  console.log(JSON.stringify(json));
});
cli.on(api.method, function(json){
  console.log(typeof json);
});