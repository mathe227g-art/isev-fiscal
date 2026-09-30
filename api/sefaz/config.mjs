import { handleApi } from '../../api-handler.mjs';

export default async function handler(request,response){
  await handleApi(request,response);
}
