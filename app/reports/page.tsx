import { listVOC } from '../../lib/data';
import ReportClient from './ReportClient';

export const dynamic = 'force-dynamic';

export default async function Reports() {
  const rows = await listVOC();
  return (
    <>
      <header className="top">
        <h1>รายงานข้อมูล</h1>
        <div className="sub">กรองข้อมูล แล้วดาวน์โหลดเป็น CSV / Excel / PDF</div>
      </header>
      <div className="content">
        <ReportClient rows={rows} />
      </div>
    </>
  );
}
