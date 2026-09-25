/** Decode OTP/Google encoded polyline at precision 5 to GeoJSON longitude/latitude. */
export function decodePolyline(encoded:string):number[][]{
 const points:number[][]=[];let index=0,lat=0,lon=0;
 const next=()=>{let shift=0,result=0,b=0;do{if(index>=encoded.length||shift>30)throw new Error('Invalid polyline');b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5}while(b>=32);return(result&1)?~(result>>1):result>>1};
 while(index<encoded.length){lat+=next();lon+=next();points.push([lon/1e5,lat/1e5])}return points;
}
