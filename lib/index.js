var taobao=require('./taobao-api.js');

module.exports = {
  //function(appkey, secret) : create a Top instance
  client: taobao.client,
  Top : taobao.Top
};

