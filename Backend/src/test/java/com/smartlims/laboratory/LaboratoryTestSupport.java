package com.smartlims.laboratory;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.orders.dto.CreateStaffOrderRequest;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.service.OrderService;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.repository.PatientRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.test.context.TestPropertySource(properties="smartlims.laboratory.authorized-admin-ids=00000000-0000-0000-0000-000000000101,00000000-0000-0000-0000-000000000102")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
abstract class LaboratoryTestSupport extends IsolatedPostgresTest {
    @Autowired com.smartlims.visits.service.VisitService visitService;
    @Autowired com.smartlims.appointments.service.AppointmentScheduleService schedule;
    @Autowired com.smartlims.appointments.service.AppointmentBookingService bookingService;
    @Autowired com.smartlims.samples.service.SampleService sampleService;
    @Autowired com.smartlims.labtests.service.TestParameterService parameterService;
    @Autowired com.smartlims.results.service.ResultDraftService draftService;
    @Autowired com.smartlims.results.service.ResultPublicationService publicationService;
    record Prepared(com.smartlims.results.dto.ResultResponse result,com.smartlims.visits.dto.VisitResponse visit,com.smartlims.samples.dto.SampleResponse sample){}
    Prepared prepared(OrderDetailResponse order){
        define(order.items().getFirst().labTestId());var visit=arrive(order,null);var sample=received(visit,order.items().getFirst().id());
        var r=draftService.create(actor(Role.LAB_TECHNICIAN),new com.smartlims.results.dto.ResultRequests.Create(order.items().getFirst().id().toString()),List.of(UUID.randomUUID().toString())).result();
        return new Prepared(draftService.edit(actor(Role.LAB_TECHNICIAN),r.id().toString(),contents(r,sample.id())),visit,sample);
    }
    com.smartlims.results.dto.ResultResponse publish(com.smartlims.results.dto.ResultResponse r){
        var approved=publicationService.approve(actor(reviewerId,Role.ADMIN),r.id().toString(),new com.smartlims.results.dto.ResultRequests.Revision(r.version()));
        return publicationService.publish(actor(reviewerId,Role.ADMIN),r.id().toString(),new com.smartlims.results.dto.ResultRequests.Revision(approved.version()));
    }
    void define(UUID test){
        parameterService.save(actor(Role.ADMIN),test.toString(),null,new com.smartlims.labtests.dto.TestParameterRequest("SYN_NUM","Synthetic numeric","NUMERIC","synthetic-unit","Synthetic method",0,true,true,null));
        parameterService.save(actor(Role.ADMIN),test.toString(),null,new com.smartlims.labtests.dto.TestParameterRequest("SYN_TEXT","Synthetic text","TEXT",null,null,1,false,true,null));
    }
    com.smartlims.results.dto.ResultRequests.Edit contents(com.smartlims.results.dto.ResultResponse result,UUID sample){
        var values=result.values().stream().map(v->new com.smartlims.results.dto.ResultRequests.Value(v.parameterId().toString(),v.resultType()==com.smartlims.labtests.entity.TestParameter.ValueType.NUMERIC?new BigDecimal("1.25"):null,null,v.resultType()==com.smartlims.labtests.entity.TestParameter.ValueType.TEXT?"Synthetic qualitative":null,"Explicitly supplied reference",v.resultType()==com.smartlims.labtests.entity.TestParameter.ValueType.NUMERIC?BigDecimal.ZERO:null,v.resultType()==com.smartlims.labtests.entity.TestParameter.ValueType.NUMERIC?BigDecimal.TEN:null,"NOT_EVALUATED","Synthetic patient-facing note")).toList();
        return new com.smartlims.results.dto.ResultRequests.Edit(result.version(),com.smartlims.laboratory.dto.LaboratoryInput.now().toString(),List.of(sample.toString()),"Synthetic approved explanation",values);
    }
    com.smartlims.samples.dto.SampleResponse received(com.smartlims.visits.dto.VisitResponse visit,UUID item){
        var sample=sampleService.create(actor(Role.LAB_TECHNICIAN),new com.smartlims.samples.dto.SampleRequests.Create(visit.id().toString(),"SYNTHETIC","Synthetic container",com.smartlims.laboratory.dto.LaboratoryInput.now().minusSeconds(10).toString(),null),List.of(UUID.randomUUID().toString())).sample();
        sampleService.receive(actor(Role.LAB_TECHNICIAN),sample.id().toString(),new com.smartlims.samples.dto.SampleRequests.Revision(0L));
        return sampleService.attest(actor(Role.LAB_TECHNICIAN),sample.id().toString(),new com.smartlims.samples.dto.SampleRequests.Attest(item.toString()));
    }
    com.smartlims.visits.dto.VisitResponse arrive(OrderDetailResponse order,UUID appointment){return visitService.arrive(actor(Role.RECEPTIONIST),new com.smartlims.visits.dto.VisitRequests.Arrival(order.id().toString(),appointment==null?null:appointment.toString(),order.items().stream().map(i->i.id().toString()).toList(),Instant.now().minusSeconds(1).truncatedTo(java.time.temporal.ChronoUnit.MICROS).toString()),List.of(UUID.randomUUID().toString())).visit();}
    com.smartlims.appointments.dto.AppointmentResponses.Detail appointment(OrderDetailResponse order,int index,int capacity){
        var type=schedule.saveType(actor(Role.ADMIN),null,new com.smartlims.appointments.dto.AppointmentRequests.Type("SYN_"+UUID.randomUUID().toString().substring(0,8),"Synthetic visit",true));
        var start=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).plusSeconds(86400+index*3600L);
        var slot=schedule.createSlot(actor(Role.RECEPTIONIST),new com.smartlims.appointments.dto.AppointmentRequests.SlotCreate(start.toString(),start.plusSeconds(1800).toString(),capacity,true));
        return bookingService.book(actor(Role.ADMIN),new com.smartlims.appointments.dto.AppointmentRequests.Book(order.id().toString(),type.id().toString(),slot.id().toString()),List.of(UUID.randomUUID().toString())).appointment();
    }
    final UUID reviewerId=UUID.fromString("00000000-0000-0000-0000-000000000101");
    final UUID otherReviewerId=UUID.fromString("00000000-0000-0000-0000-000000000102");
    UserAccount reviewer;
    UserAccount otherReviewer;
    String reviewerToken;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserAccountRepository users;
    @Autowired PatientRepository patients;
    @Autowired LabTestRepository tests;
    @Autowired TestOrderRepository orders;
    @Autowired OrderService creation;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoBean VerificationEmailSender email;
    final Map<Role, UserAccount> actors = new EnumMap<>(Role.class);
    final Map<Role, String> tokens = new EnumMap<>(Role.class);
    Patient own;
    Patient other;
    Patient unlinked;
    LabTest first;
    LabTest free;
    UserAccount stranger;
    String strangerToken;

    @BeforeEach
    void workflowFixtures() {
        jdbc.execute("TRUNCATE TABLE patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items,test_orders,lab_test_categories,lab_tests,patient_link_tokens,patients,email_action_tokens,users");
        for (Role role : Role.values()) {
            var account = account(role.name().toLowerCase(Locale.ROOT), role);
            actors.put(role, account);
            tokens.put(role, token(account));
        }
        stranger = account("stranger", Role.PATIENT);
        strangerToken = token(stranger);
        own = profile(actors.get(Role.PATIENT));
        other = profile(stranger);
        unlinked = profile(null);
        first = tests.saveAndFlush(new LabTest("Z_SYN", "Synthetic first test", null, new BigDecimal("12.34"), "SYNTHETIC", null));
        free = tests.saveAndFlush(new LabTest("A_SYN", "Synthetic free test", null, new BigDecimal("0.00"), "SYNTHETIC", null));
        for(UUID id:List.of(reviewerId,otherReviewerId))jdbc.update("INSERT INTO users(id,full_name,email,role,origin,enabled,email_verified_at,invitation_accepted_at,password_hash) VALUES (?,'Synthetic laboratory reviewer',?,'ADMIN','ADMIN_INVITATION',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'synthetic-unused-hash')",id,id+"@example.invalid");
        reviewer=users.findById(reviewerId).orElseThrow();otherReviewer=users.findById(otherReviewerId).orElseThrow();reviewerToken=token(reviewer);
    }

    private UserAccount account(String name, Role role) {
        var account = UserAccount.invite("Synthetic workflow actor", name + "@example.invalid", null, null, role);
        account.acceptInvitation("test-only-unused-hash", Instant.now());
        return users.saveAndFlush(account);
    }

    private Patient profile(UserAccount linked) {
        var patient = new Patient("PAT-" + patients.nextPatientNumber(), actors.get(Role.ADMIN),
                "Synthetic workflow profile", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null);
        if (linked != null) patient.linkAccount(linked);
        return patients.saveAndFlush(patient);
    }

    String token(UserAccount account) {
        var now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(account.getId().toString()).issuer(JwtKeyConfiguration.ISSUER)
                .audience(List.of(JwtKeyConfiguration.AUDIENCE)).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    Authentication actor(Role role) { return actor(actors.get(role).getId(), role); }
    Authentication actor(UUID id, Role role) {
        return UsernamePasswordAuthenticationToken.authenticated(id.toString(), null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }
    MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, Role role) {
        return request.header("Authorization", "Bearer " + tokens.get(role));
    }
    OrderDetailResponse create(Patient patient, LabTest... selection) {
        return creation.create(actor(Role.ADMIN), new CreateStaffOrderRequest(patient.getId().toString(),
                Arrays.stream(selection).map(test -> test.getId().toString()).toList()), List.of(UUID.randomUUID().toString())).order();
    }
    void state(UUID id, String status) {
        if (status.equals("CANCELLED")) jdbc.update("UPDATE test_orders SET status=?,cancelled_by=?,cancelled_at=created_at,cancellation_reason='Synthetic cancellation' WHERE id=?",
                status, actors.get(Role.ADMIN).getId(), id);
        else jdbc.update("UPDATE test_orders SET status=? WHERE id=?", status, id);
    }
    void error(ResultActions result, int status, String code, String field) throws Exception {
        var response = result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        var body = json.readTree(response.getContentAsByteArray());
        assertEquals(response.getHeader("X-Request-Id"), body.get("requestId").asString());
        assertEquals(Set.of("code", "message", "fieldErrors", "requestId"), json.readValue(response.getContentAsByteArray(), Map.class).keySet());
        if (field == null) assertEquals(0, body.get("fieldErrors").size());
        else assertTrue(body.get("fieldErrors").has(field));
    }
}
